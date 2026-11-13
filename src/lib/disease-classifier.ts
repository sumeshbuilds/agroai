import type { DiseaseAnalysis, PathogenType } from "./disease";

/**
 * Optional open plant-disease image classifier.
 *
 * Hugging Face Inference exposes fine-tuned PlantVillage-style classifiers.
 * A classifier is fast and cheap, but it only knows the classes it was trained
 * on (mostly tomato, potato, maize, grape, apple and pepper). We use it as a
 * **consensus signal** for the vision model: it can confirm a diagnosis, add a
 * differential, or lower confidence. It never replaces the explainable vision
 * read on its own, and it is skipped when the farmer's crop is outside its
 * label set.
 *
 * Benchmark honesty: published PlantVillage accuracy (~95–99 %) is measured on
 * lab-style leaf images. Real field photos with soil, shadows and mixed
 * backgrounds score lower. This module does not claim a 97 % field accuracy.
 */

const DEFAULT_MODEL =
  "linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification";
const DEFAULT_TIMEOUT_MS = 12_000;

export interface ClassifierSignal {
  provider: "huggingface";
  model: string;
  rawLabel: string;
  score: number;
  cropName: string | null;
  diseaseName: string | null;
  pathogenType: PathogenType;
  healthStatus: "healthy" | "diseased";
  /** False when the classifier's crop does not match the farmer's crop. */
  compatible: boolean;
}

export class ClassifierUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClassifierUnavailableError";
  }
}

function token(): string | null {
  return (
    process.env.HF_API_TOKEN?.trim() ||
    process.env.HUGGINGFACE_API_KEY?.trim() ||
    null
  );
}

export function isClassifierConfigured(): boolean {
  return Boolean(token());
}

export function classifierModel(): string {
  return process.env.HF_DISEASE_MODEL?.trim() || DEFAULT_MODEL;
}

function classifierEndpoint(model: string): string {
  const configured = process.env.HF_DISEASE_ENDPOINT?.trim();
  if (configured) return configured.replace("{model}", model);
  return `https://router.huggingface.co/hf-inference/models/${model}`;
}

function timeoutMs(): number {
  const value = Number(process.env.HF_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 3_000 && value <= 30_000
    ? value
    : DEFAULT_TIMEOUT_MS;
}

const CROP_ALIASES: Record<string, string> = {
  corn: "maize",
  "corn (maize)": "maize",
  maize: "maize",
  rice: "paddy",
  paddy: "paddy",
  "pepper, bell": "pepper",
  "pepper bell": "pepper",
  "bell pepper": "pepper",
  "cherry (including sour)": "cherry",
  "tomato": "tomato",
  "potato": "potato",
  "grape": "grape",
  "apple": "apple",
  "peach": "peach",
  "strawberry": "strawberry",
  "squash": "squash",
  "soybean": "soybean",
  "blueberry": "blueberry",
  "raspberry": "raspberry",
  "orange": "citrus",
  "citrus": "citrus",
};

function normaliseCrop(raw: string): string {
  const cleaned = raw
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return CROP_ALIASES[cleaned] ?? cleaned;
}

function normaliseName(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function pathogenFrom(text: string): PathogenType {
  const value = text.toLowerCase();
  if (/bacterial/.test(value)) return "bacterial";
  if (/virus|mosaic|curl/.test(value)) return "viral";
  if (/mite|spider|borer|aphid|thrip|whitefly|pest/.test(value)) return "pest";
  if (/blight|rust|mildew|rot|spot|scab|scorch|mold|mould|rust/.test(value)) {
    return "fungal";
  }
  if (/nutrient|deficiency|chlorosis/.test(value)) return "nutrient";
  return "unknown";
}

const PATHOGEN_WORDS: Array<[RegExp, PathogenType]> = [
  [/bacterial/i, "bacterial"],
  [/virus|mosaic|curl/i, "viral"],
  [/mite|spider|borer|aphid|thrip|whitefly|pest/i, "pest"],
  [/blight|rust|mildew|rot|spot|scab|scorch|mold|mould/i, "fungal"],
];

/** Maps a PlantVillage-style label (`Tomato___Late_blight`). */
export function mapClassifierLabel(
  label: string,
  farmerCrop?: string | null,
): Omit<ClassifierSignal, "provider" | "model" | "score"> {
  const trimmed = label.trim();
  const [rawCropPart, ...rest] = trimmed.split("___");
  const rawDisease = rest.join("___");

  if (/background_without_leaves|background/i.test(trimmed)) {
    return {
      rawLabel: trimmed,
      cropName: null,
      diseaseName: null,
      pathogenType: "unknown",
      healthStatus: "diseased",
      compatible: false,
    };
  }

  const classifierCrop = rawCropPart ? normaliseCrop(rawCropPart) : null;
  const diseaseRaw = rawDisease || "healthy";
  const healthy = /^healthy$/i.test(diseaseRaw.replace(/_/g, " "));
  const diseaseName = healthy ? null : normaliseName(diseaseRaw);
  const pathogenType = healthy
    ? "unknown"
    : pathogenFrom(diseaseName ?? "") !== "unknown"
      ? pathogenFrom(diseaseName ?? "")
      : PATHOGEN_WORDS.find(([pattern]) => pattern.test(diseaseName ?? ""))?.[1] ??
        "unknown";

  const reported = (farmerCrop ?? "").toLowerCase();
  const compatible =
    !reported ||
    !classifierCrop ||
    reported.includes(classifierCrop) ||
    classifierCrop.includes(reported.split(" ")[0] ?? "");

  return {
    rawLabel: trimmed,
    cropName: classifierCrop,
    diseaseName,
    pathogenType,
    healthStatus: healthy ? "healthy" : "diseased",
    compatible,
  };
}

function parseScores(payload: unknown): Array<{ label: string; score: number }> {
  if (Array.isArray(payload)) {
    const first = payload[0];
    if (Array.isArray(first)) {
      return parseScores(first);
    }
    return payload
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        if (typeof record.label !== "string") return null;
        const score = Number(record.score);
        if (!Number.isFinite(score)) return null;
        return { label: record.label, score };
      })
      .filter((entry): entry is { label: string; score: number } => entry !== null)
      .sort((a, b) => b.score - a.score);
  }
  return [];
}

/**
 * Classifies one photo. Returns null when the provider is not configured, the
 * model is loading, or the reply cannot be parsed. Never throws.
 */
export async function classifyPlantImage(input: {
  imageBase64: string;
  mimeType: string;
  cropName?: string | null;
}): Promise<ClassifierSignal | null> {
  const apiKey = token();
  if (!apiKey) return null;

  const model = classifierModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const body = Buffer.from(input.imageBase64, "base64");
    const response = await fetch(classifierEndpoint(model), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": input.mimeType,
        Accept: "application/json",
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      // 503 usually means the model is cold-starting. The vision model still
      // returns a useful answer, so a classifier miss must stay silent.
      return null;
    }

    const payload = await response.json().catch(() => null);
    const scores = parseScores(payload);
    if (scores.length === 0) return null;

    const best = scores[0];
    const mapped = mapClassifierLabel(best.label, input.cropName);
    if (!mapped.compatible) return null;

    return {
      provider: "huggingface",
      model,
      score: Math.min(1, Math.max(0, best.score)),
      ...mapped,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function key(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(disease|infection|problem|leaf|leaves)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameDisease(a: string, b: string): boolean {
  const left = key(a);
  const right = key(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

/**
 * Folds the classifier into the vision analysis.
 *
 * - Agreement raises confidence by up to +0.10 and records the second model.
 * - Disagreement lowers confidence and adds the classifier's answer as a
 *   differential, so the farmer sees both candidates.
 * - The classifier never creates a diagnosis when the vision model saw no
 *   plant, and never overrides a healthy reading.
 */
export function mergeClassifierSignal(
  analysis: DiseaseAnalysis,
  signal: ClassifierSignal | null,
): { analysis: DiseaseAnalysis; agreed: boolean | null } {
  if (!signal) return { analysis, agreed: null };
  if (!signal.compatible) return { analysis, agreed: null };
  if (analysis.subject === "not_plant") return { analysis, agreed: null };
  if (signal.score < 0.45) return { analysis, agreed: null };

  const bothHealthy =
    analysis.healthStatus === "healthy" && signal.healthStatus === "healthy";
  const bothDiseased =
    analysis.healthStatus === "diseased" &&
    signal.healthStatus === "diseased" &&
    Boolean(
      analysis.diseaseName &&
        signal.diseaseName &&
        sameDisease(analysis.diseaseName, signal.diseaseName),
    );

  if (bothHealthy || bothDiseased) {
    const boost = signal.score >= 0.8 ? 0.1 : signal.score >= 0.6 ? 0.06 : 0.03;
    const confidence =
      analysis.healthStatus === "diseased"
        ? Math.min(0.95, analysis.confidence + boost)
        : analysis.confidence;
    return {
      agreed: true,
      analysis: { ...analysis, confidence },
    };
  }

  const differs =
    (analysis.healthStatus === "diseased" && signal.healthStatus === "healthy") ||
    (analysis.healthStatus === "healthy" && signal.healthStatus === "diseased") ||
    (analysis.healthStatus === "diseased" &&
      signal.healthStatus === "diseased" &&
      signal.diseaseName !== null &&
      analysis.diseaseName !== null &&
      !sameDisease(analysis.diseaseName, signal.diseaseName));

  if (!differs) return { analysis, agreed: null };

  const differentials = [...analysis.differentials];
  if (signal.diseaseName) {
    differentials.push({
      name: signal.diseaseName,
      confidence: Math.round(signal.score * 100) / 100,
      note: "Suggested by the plant-image classifier.",
    });
  }

  return {
    agreed: false,
    analysis: {
      ...analysis,
      confidence: Math.max(0.15, Math.min(0.85, analysis.confidence - 0.08)),
      differentials: differentials
        .filter(
          (entry, index, list) =>
            list.findIndex(
              (candidate) =>
                key(candidate.name) === key(entry.name),
            ) === index,
        )
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 4),
    },
  };
}
