/**
 * Server-side Groq vision verifier.
 *
 * The phone already does fast on-device detection. Groq is used as a second,
 * much more accurate opinion **only when a new human/animal track appears** —
 * not for every frame. That keeps accuracy high without burning mobile data.
 *
 * Preferred model (Oct 2026): `qwen/qwen3.8-27b`, a fast multimodal model with
 * JSON mode. Override with `GROQ_VISION_MODEL`.
 */

import type { DetectionBox } from "./camera";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "qwen/qwen3.8-27b";
const DEFAULT_TIMEOUT_MS = 4_500;

const SYSTEM_PROMPT = [
  "You are a farm security vision verifier.",
  "Look at the camera frame and decide whether it contains humans or animals.",
  "Track only humans, farm animals and wild animals.",
  "Ignore vehicles, buildings, plants, tools and other objects.",
  "Be conservative: only report something you can actually see.",
  "Reply with JSON only.",
].join(" ");

export interface GroqCandidate {
  objectClass: string;
  confidence: number;
  box: DetectionBox;
}

export interface GroqAnimal {
  species: string;
  confidence: number;
}

export interface GroqVerdict {
  verdict: "human" | "animal" | "both" | "none";
  humans: number;
  humanConfidence: number;
  animals: GroqAnimal[];
  note?: string;
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function modelName(): string {
  return process.env.GROQ_VISION_MODEL?.trim() || DEFAULT_MODEL;
}

function timeoutMs(): number {
  const value = Number(process.env.GROQ_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1_000 && value <= 15_000
    ? value
    : DEFAULT_TIMEOUT_MS;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function buildPrompt(candidates: GroqCandidate[]): string {
  const lines = candidates.map((candidate, index) => {
    const [x, y, w, h] = candidate.box;
    const cx = (x + w / 2).toFixed(2);
    const cy = (y + h / 2).toFixed(2);
    return `- #${index + 1} ${candidate.objectClass} at centre (${cx}, ${cy}) with on-device confidence ${candidate.confidence.toFixed(2)}`;
  });

  return [
    "The on-device tracker reported these candidates:",
    lines.length > 0 ? lines.join("\n") : "- none",
    "",
    "Return exactly this JSON shape:",
    '{"verdict":"human|animal|both|none","humans":0,"human_confidence":0,"animals":[{"species":"cow","confidence":0.9}],"note":"short reason"}',
    "",
    "Rules:",
    "- humans: integer count of people visible.",
    "- human_confidence: 0–1 how sure you are about the people count.",
    "- animals: only visible humans-independent animals; use simple lowercase species names (cow, dog, wild boar, tiger, monkey, bird).",
    "- If you see no humans or animals, use verdict \"none\" with empty arrays.",
  ].join("\n");
}

/** Extracts the first JSON object from a model reply (handles code fences). */
export function parseGroqJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function normaliseVerdict(value: unknown): GroqVerdict | null {
  const record = asRecord(value);
  const rawVerdict = String(record.verdict ?? "").toLowerCase();

  const humansRaw = Number(record.humans);
  const humans = Number.isFinite(humansRaw)
    ? Math.max(0, Math.min(30, Math.round(humansRaw)))
    : 0;
  const humanConfidence = clamp01(Number(record.human_confidence));

  const animals: GroqAnimal[] = [];
  if (Array.isArray(record.animals)) {
    for (const entry of record.animals.slice(0, 8)) {
      const animal = asRecord(entry);
      const species = String(animal.species ?? "").trim().toLowerCase();
      if (!species) continue;
      const confidence = clamp01(Number(animal.confidence));
      animals.push({ species: species.slice(0, 40), confidence });
    }
  }

  const verdict: GroqVerdict["verdict"] =
    rawVerdict === "human" || rawVerdict === "animal" || rawVerdict === "both"
      ? rawVerdict
      : humans > 0 && animals.length > 0
        ? "both"
        : humans > 0
          ? "human"
          : animals.length > 0
            ? "animal"
            : "none";

  if (verdict === "none" && humans === 0 && animals.length === 0) {
    return {
      verdict: "none",
      humans: 0,
      humanConfidence: 0,
      animals: [],
      note: typeof record.note === "string" ? record.note.slice(0, 160) : undefined,
    };
  }

  return {
    verdict,
    humans,
    humanConfidence,
    animals,
    note: typeof record.note === "string" ? record.note.slice(0, 160) : undefined,
  };
}

/**
 * Sends one JPEG frame to Groq and returns a normalised verdict, or `null` when
 * the verifier is disabled / the request fails. Callers must treat `null` as
 * "no second opinion" rather than "nothing in frame".
 */
export async function verifyFrameWithGroq(input: {
  frame: string;
  candidates: GroqCandidate[];
}): Promise<GroqVerdict | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

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
          model: modelName(),
          temperature: 0,
          max_completion_tokens: 300,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: buildPrompt(input.candidates) },
                { type: "image_url", image_url: { url: input.frame } },
              ],
            },
          ],
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      console.warn(
        "[groq] vision verification failed:",
        response.status,
        (await response.text().catch(() => "")).slice(0, 200),
      );
      return null;
    }

    const payload = (await response.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return null;

    return normaliseVerdict(parseGroqJson(content));
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError") {
      console.warn("[groq] vision request error:", error.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
