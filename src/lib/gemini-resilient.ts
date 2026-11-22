/**
 * Resilience wrapper around the Google Gemini API.
 *
 * Gemini throttles hard during demand spikes: `gemini-3.8-flash` regularly
 * answers 503 "high demand" or simply hangs. A single call therefore throws
 * away work that a short retry or a different model would have finished. The
 * retry + model-fallback policy lives here so every Gemini caller (plant scan,
 * Odia translation, advisory) behaves the same way.
 */

import {
  GoogleGenerativeAI,
  type GenerationConfig,
  type Part,
} from "@google/generative-ai";

import { getGeminiModel } from "./gemini";

export type GeminiContents = string | Array<string | Part>;

const DEFAULT_ATTEMPTS = 2;
const MAX_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = 700;
const MIN_ATTEMPT_TIMEOUT_MS = 5_000;

/**
 * Models tried after the primary when it keeps answering 503/high-demand.
 * `gemini-flash-latest` resolves to the same busy model and the retired 2.5
 * family 404s for new keys, so the dependable fallbacks are the lite models.
 * Override with GEMINI_FALLBACK_MODELS (comma-separated).
 */
export const DEFAULT_GEMINI_FALLBACK_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

const RETRYABLE_ERROR =
  /(^|[^0-9])(429|500|502|503|504)([^0-9]|$)|high demand|overloaded|service unavailable|rate limit|too many requests/i;
const NON_RETRYABLE_ERROR =
  /not found|(^|[^0-9])404([^0-9]|$)|api key|permission|invalid/i;
const TIMEOUT_ERROR = /timeout|timed out|abort/i;
const MODEL_ERROR =
  /not found|does not exist|not supported|unsupported|(^|[^0-9])404([^0-9]|$)/i;

function clampAttempts(value: number | undefined): number {
  if (value === undefined) {
    const env = Number(process.env.DISEASE_GEMINI_ATTEMPTS);
    if (Number.isFinite(env) && env >= 1 && env <= MAX_ATTEMPTS) {
      return Math.floor(env);
    }
    return DEFAULT_ATTEMPTS;
  }
  return Number.isFinite(value) && value >= 1 && value <= MAX_ATTEMPTS
    ? Math.floor(value)
    : DEFAULT_ATTEMPTS;
}

/** Comma-separated fallback models, or the built-in lite models. */
export function geminiFallbackModels(): string[] {
  const configured = (process.env.GEMINI_FALLBACK_MODELS ?? "").trim();
  if (configured) {
    return configured
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return DEFAULT_GEMINI_FALLBACK_MODELS;
}

/** True for a transient error that a retry or another model may clear. */
export function isRetryableGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (NON_RETRYABLE_ERROR.test(message)) return false;
  return RETRYABLE_ERROR.test(message);
}

/** True when the model name itself is unusable, so the next model is worth trying. */
export function isMissingGeminiModel(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return MODEL_ERROR.test(message);
}

/** True when a call simply ran out of time, so the next model is worth trying. */
export function isGeminiTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TIMEOUT_ERROR.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GenerateGeminiTextOptions {
  apiKey: string;
  contents: GeminiContents;
  systemInstruction?: string;
  generationConfig?: GenerationConfig;
  /** Budget for the whole stage (all attempts), in ms. */
  timeoutMs: number;
  /** Models tried after the primary. Defaults to the lite model list. */
  fallbackModels?: string[];
  /** Attempts per model before moving on. Defaults to DISEASE_GEMINI_ATTEMPTS. */
  attemptsPerModel?: number;
  baseUrl?: string;
  /** Called when an attempt fails but another will be tried. */
  onRetry?: (info: {
    model: string;
    attempt: number;
    total: number;
    error: unknown;
  }) => void;
}

/**
 * Generates text with the primary Gemini model, falling back across lite models
 * and retrying transient errors. Throws the last provider error when every
 * attempt is exhausted, so callers can decide how to degrade.
 */
export async function generateGeminiText(
  options: GenerateGeminiTextOptions,
): Promise<{ text: string; model: string }> {
  const primary = getGeminiModel();
  const fallbacks = (options.fallbackModels ?? geminiFallbackModels()).filter(
    (model) => model && model !== primary,
  );
  const attemptsPerModel = clampAttempts(options.attemptsPerModel);

  // Round-robin plan: primary, each fallback, then repeat. A busy primary moves
  // on to a different model immediately instead of hammering the same one.
  const plan: string[] = [];
  const candidates = [primary, ...fallbacks];
  for (let round = 0; round < attemptsPerModel; round += 1) {
    for (const candidate of candidates) {
      if (plan.length < MAX_ATTEMPTS) plan.push(candidate);
    }
  }

  const client = new GoogleGenerativeAI(options.apiKey);
  const deadline = Date.now() + options.timeoutMs;
  // Each attempt gets a slice of the budget so one hung model cannot eat the
  // whole window before the fallbacks are tried.
  const perAttemptCap = Math.max(
    8_000,
    Math.min(20_000, Math.floor(options.timeoutMs / 3)),
  );

  let lastError: unknown;
  for (let index = 0; index < plan.length; index += 1) {
    const model = plan[index];
    const remaining = deadline - Date.now();
    if (index > 0 && remaining < MIN_ATTEMPT_TIMEOUT_MS) break;
    const attemptTimeout = Math.max(
      MIN_ATTEMPT_TIMEOUT_MS,
      Math.min(perAttemptCap, remaining),
    );

    try {
      const generativeModel = client.getGenerativeModel(
        {
          model,
          ...(options.systemInstruction
            ? { systemInstruction: options.systemInstruction }
            : {}),
          ...(options.generationConfig
            ? { generationConfig: options.generationConfig }
            : {}),
        },
        { timeout: attemptTimeout, ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}) },
      );

      const result = await generativeModel.generateContent(options.contents);
      const text = result.response.text().trim();
      if (!text) throw new Error("Gemini returned an empty response.");
      return { text, model };
    } catch (error) {
      lastError = error;
      const exhausted =
        index >= plan.length - 1 || deadline - Date.now() < MIN_ATTEMPT_TIMEOUT_MS;
      const transient =
        isRetryableGeminiError(error) ||
        isMissingGeminiModel(error) ||
        isGeminiTimeout(error);
      if (!exhausted && transient) {
        options.onRetry?.({
          model,
          attempt: index + 1,
          total: plan.length,
          error,
        });
        await delay(Math.min(RETRY_BACKOFF_MS * (index + 1), 1_500));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini text generation failed.");
}
