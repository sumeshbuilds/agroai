/**
 * Server-side Groq text generation (OpenAI-compatible chat completions).
 *
 * Used as the fallback when Gemini is throttled and for pure-text work such as
 * Odia translation — no image is attached, so the fast text models are enough.
 * Returns `null` on any failure so callers can keep the English source.
 */

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "qwen/qwen3.8-27b";
const DEFAULT_TIMEOUT_MS = 18_000;

export function isGroqTextConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function modelName(override?: string): string {
  return (
    override?.trim() ||
    process.env.GROQ_TRANSLATE_MODEL?.trim() ||
    process.env.GROQ_DISEASE_MODEL?.trim() ||
    process.env.GROQ_VISION_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

function timeoutMs(value?: number): number {
  if (Number.isFinite(value) && (value as number) >= 1_000 && (value as number) <= 55_000) {
    return value as number;
  }
  const env = Number(process.env.GROQ_TEXT_TIMEOUT_MS);
  return Number.isFinite(env) && env >= 1_000 && env <= 55_000 ? env : DEFAULT_TIMEOUT_MS;
}

export interface GenerateGroqTextOptions {
  system: string;
  prompt: string;
  model?: string;
  timeoutMs?: number;
  maxTokens?: number;
  /** Ask the model for a JSON object (sets response_format). */
  jsonObject?: boolean;
}

export async function generateGroqText(
  options: GenerateGroqTextOptions,
): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  const model = modelName(options.model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs(options.timeoutMs));

  try {
    const response = await fetch(
      process.env.GROQ_BASE_URL?.trim() || GROQ_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_completion_tokens: options.maxTokens ?? 4096,
          ...(options.jsonObject
            ? { response_format: { type: "json_object" } }
            : {}),
          messages: [
            { role: "system", content: options.system },
            { role: "user", content: options.prompt },
          ],
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      console.warn(
        "[groq] text failed:",
        response.status,
        (await response.text().catch(() => "")).slice(0, 160),
      );
      return null;
    }

    const payload = (await response.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const content = payload?.choices?.[0]?.message?.content?.trim();
    return content ? { text: content, model } : null;
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) {
      console.warn(
        "[groq] text error:",
        error instanceof Error ? error.message : String(error),
      );
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
