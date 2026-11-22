import { connection, type NextRequest } from "next/server";

import { isGeminiConfigured } from "@/lib/gemini";
import { generateGeminiText } from "@/lib/gemini-resilient";
import { generateGroqText, isGroqTextConfigured } from "@/lib/groq-text";
import { fail, handleRouteError, ok } from "@/lib/http";
import { getSessionFarmer } from "@/lib/auth";

/**
 * POST /api/translate
 * Body: { texts: string[], lang?: "or" }
 *
 * Translates short UI-adjacent strings that were generated at runtime (plant
 * health advice, checklist details) into Odia. Rules, numbers and units are
 * preserved by the model; the route returns a keyed object so callers can map
 * straight back onto their rows.
 *
 * Gemini is the primary translator, with the shared retry/model-fallback policy
 * (the default `gemini-3.8-flash` throttles hard). When Gemini is exhausted the
 * same sentences go to Groq, so a busy Gemini no longer leaves the screen in
 * English. Results are memoised in-process: a sentence is only paid for once.
 */

const MAX_ITEMS = 40;
const MAX_CHARS = 600;
const MAX_INPUT_CHARS = 9_000;
const TRANSLATE_TIMEOUT_MS = 20_000;

const SYSTEM_INSTRUCTION = [
  "You translate short farm-advice sentences from English to simple, spoken Odia (ଓଡ଼ିଆ) for smallholder farmers in Odisha.",
  "Keep numbers, units (mm, °C, km/h), dates, chemical/product names and EPPO/Latin names exactly as written.",
  "Never add advice that is not in the source.",
  "Return ONLY a JSON array of strings, same order, same length, no markdown, no prose.",
].join(" ");

/** Trim and de-duplicate so one request never repeats a sentence. */
function prepare(texts: unknown): string[] | null {
  if (!Array.isArray(texts)) return null;
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of texts) {
    if (typeof item !== "string") continue;
    const text = item.trim().slice(0, MAX_CHARS);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    list.push(text);
    if (list.length >= MAX_ITEMS) break;
  }
  return list;
}

/** Builds the prompt asking for a JSON array, one Odia string per input. */
function buildPrompt(texts: string[]): string {
  return [
    `Translate these ${texts.length} sentences to Odia. Return a JSON array only.`,
    JSON.stringify(texts),
  ].join("\n");
}

function parseArray(text: string): string[] | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(value)) return null;
    return value.map((item) => (typeof item === "string" ? item : ""));
  } catch {
    return null;
  }
}

/** Returns one translation per input, or null when the reply is unusable. */
function acceptArray(
  parsed: string[] | null,
  expected: number,
): string[] | null {
  if (!parsed || parsed.length !== expected) return null;
  return parsed;
}

async function translateWithGemini(texts: string[]): Promise<string[] | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const { text } = await generateGeminiText({
      apiKey,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      contents: buildPrompt(texts),
      timeoutMs: TRANSLATE_TIMEOUT_MS,
      baseUrl: process.env.GEMINI_BASE_URL?.trim(),
      onRetry: ({ model: attempted, attempt, total, error }) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[translate] Gemini attempt ${attempt}/${total} (${attempted}) failed, trying next:`,
          message.slice(0, 160),
        );
      },
    });
    return acceptArray(parseArray(text), texts.length);
  } catch (error) {
    console.error(
      "[translate] Gemini unavailable:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

async function translateWithGroq(texts: string[]): Promise<string[] | null> {
  const result = await generateGroqText({
    system: SYSTEM_INSTRUCTION,
    prompt: buildPrompt(texts),
    timeoutMs: TRANSLATE_TIMEOUT_MS,
  });
  if (!result) return null;
  console.warn(`[translate] Gemini failed; Groq translated with ${result.model}.`);
  return acceptArray(parseArray(result.text), texts.length);
}

const cache = new Map<string, string>();

export async function POST(request: NextRequest) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to translate advice.", 401, { code: "AUTH_REQUIRED" });
    }

    if (!isGeminiConfigured() && !isGroqTextConfigured()) {
      return fail("Translation is not configured.", 503, {
        code: "TRANSLATE_NOT_CONFIGURED",
      });
    }

    const body = (await request.json().catch(() => null)) as
      | { texts?: unknown }
      | null;
    const texts = prepare(body?.texts);
    if (!texts || texts.length === 0) {
      return fail("Send at least one sentence to translate.", 400, {
        code: "BAD_REQUEST",
      });
    }
    if (texts.join("\n").length > MAX_INPUT_CHARS) {
      return fail("Too much text in one request.", 413, { code: "TOO_LARGE" });
    }

    const translations: Record<string, string> = {};
    const missing: string[] = [];
    for (const text of texts) {
      const hit = cache.get(text);
      if (hit) translations[text] = hit;
      else missing.push(text);
    }

    if (missing.length > 0) {
      // Try Gemini first (with retry + model fallback), then Groq. Either
      // provider failing simply leaves the English text on screen.
      let values = await translateWithGemini(missing);
      if (!values) values = await translateWithGroq(missing);

      if (values) {
        missing.forEach((text, index) => {
          const value = values[index]?.trim();
          if (!value) return;
          translations[text] = value;
          if (cache.size < 2_000) cache.set(text, value);
        });
      }
    }

    return ok({ translations });
  } catch (error) {
    return handleRouteError(error);
  }
}
