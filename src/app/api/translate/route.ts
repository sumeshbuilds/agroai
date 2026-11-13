import { connection, type NextRequest } from "next/server";

import { GoogleGenerativeAI } from "@google/generative-ai";

import { getSessionFarmer } from "@/lib/auth";
import { getGeminiModel, isGeminiConfigured } from "@/lib/gemini";
import { fail, handleRouteError, ok } from "@/lib/http";

/**
 * POST /api/translate
 * Body: { texts: string[], lang?: "or" }
 *
 * Translates short UI-adjacent strings that were generated at runtime (plant
 * health advice, checklist details) into Odia. Rules, numbers and units are
 * preserved by the model; the route returns the same array shape so callers
 * can map straight back onto their rows.
 *
 * Results are memoised in-process: the same sentence is only ever paid for
 * once per server instance.
 */

const MAX_ITEMS = 40;
const MAX_CHARS = 600;
const MAX_INPUT_CHARS = 9_000;
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

const cache = new Map<string, string>();

export async function POST(request: NextRequest) {
  await connection();

  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to translate advice.", 401, { code: "AUTH_REQUIRED" });
    }

    if (!isGeminiConfigured()) {
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
      const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!.trim());
      const model = client.getGenerativeModel({
        model: getGeminiModel(),
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        systemInstruction:
          "You translate short farm-advice sentences from English to simple, spoken Odia (ଓଡ଼ିଆ) for smallholder farmers in Odisha. Keep numbers, units (mm, °C, km/h), dates and product categories exactly. Never add advice that is not in the source. Return ONLY a JSON array of strings, same order, same length, no markdown.",
      });

      const prompt = [
        `Translate these ${missing.length} sentences to Odia. Return a JSON array only.`,
        JSON.stringify(missing),
      ].join("\n");

      const result = await model.generateContent(prompt);
      const parsed = parseArray(result.response.text());
      if (parsed && parsed.length === missing.length) {
        missing.forEach((text, index) => {
          const value = parsed[index]?.trim();
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
