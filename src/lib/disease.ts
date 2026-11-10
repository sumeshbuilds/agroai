/**
 * Shared plant-health types used by the scan API, the database schema and the
 * UI. Keep this module free of server-only imports.
 */

export const PLANT_PARTS = [
  { value: "leaf", label: "Leaf", emoji: "🍃" },
  { value: "stem", label: "Stem", emoji: "🌱" },
  { value: "fruit", label: "Fruit / pod", emoji: "🍅" },
  { value: "flower", label: "Flower", emoji: "🌼" },
  { value: "root", label: "Root", emoji: "🥕" },
  { value: "whole_plant", label: "Whole plant", emoji: "🌿" },
] as const;

export type PlantPart = (typeof PLANT_PARTS)[number]["value"];

export const DISEASE_HEALTH_STATUSES = [
  "healthy",
  "diseased",
  "uncertain",
] as const;

export type DiseaseHealthStatus = (typeof DISEASE_HEALTH_STATUSES)[number];

export const PATHOGEN_TYPES = [
  "fungal",
  "bacterial",
  "viral",
  "pest",
  "nutrient",
  "environmental",
  "unknown",
] as const;

export type PathogenType = (typeof PATHOGEN_TYPES)[number];

export const DISEASE_SEVERITIES = [
  "none",
  "low",
  "moderate",
  "high",
  "unknown",
] as const;

export type DiseaseSeverity = (typeof DISEASE_SEVERITIES)[number];

export interface DiseaseAnalysis {
  cropName: string | null;
  plantPart: string;
  healthStatus: DiseaseHealthStatus;
  diseaseName: string | null;
  pathogenType: PathogenType;
  severity: DiseaseSeverity;
  /** 0–1 */
  confidence: number;
  summary: string;
  symptoms: string[];
  causes: string[];
  immediateActions: string[];
  organicTreatment: string[];
  chemicalTreatment: string[];
  prevention: string[];
  lookAlikes: string[];
}

export interface DiseaseScanDTO extends DiseaseAnalysis {
  id: number;
  cropId: number | null;
  note: string | null;
  source: "gemini" | "groq";
  model: string | null;
  imageUrl: string;
  createdAt: string | null;
}

export const HEALTH_STATUS_META: Record<
  DiseaseHealthStatus,
  { label: string; short: string }
> = {
  healthy: { label: "Looks healthy", short: "Healthy" },
  diseased: { label: "Likely disease detected", short: "Disease" },
  uncertain: { label: "Needs a closer look", short: "Unclear" },
};

export const PATHOGEN_META: Record<PathogenType, { label: string; emoji: string }> = {
  fungal: { label: "Fungal", emoji: "🍄" },
  bacterial: { label: "Bacterial", emoji: "🦠" },
  viral: { label: "Viral", emoji: "🧬" },
  pest: { label: "Pest damage", emoji: "🐛" },
  nutrient: { label: "Nutrient problem", emoji: "🧪" },
  environmental: { label: "Weather / soil stress", emoji: "🌦️" },
  unknown: { label: "Not sure", emoji: "🔎" },
};

export const SEVERITY_META: Record<
  DiseaseSeverity,
  { label: string; tone: "leaf" | "warn" | "danger" | "muted" }
> = {
  none: { label: "No damage seen", tone: "leaf" },
  low: { label: "Low severity", tone: "leaf" },
  moderate: { label: "Moderate severity", tone: "warn" },
  high: { label: "High severity", tone: "danger" },
  unknown: { label: "Severity unclear", tone: "muted" },
};

export const DISEASE_DISCLAIMER =
  "This is an AI visual check, not a laboratory test. Confirm the diagnosis with your local agriculture officer or KVK before spending money on pesticides.";

export function isPlantPart(value: unknown): value is PlantPart {
  return PLANT_PARTS.some((part) => part.value === value);
}

export function plantPartLabel(value: string): string {
  return PLANT_PARTS.find((part) => part.value === value)?.label ?? "Plant part";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown, maxLength = 800): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanList(value: unknown, maxItems = 6): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const entry of value) {
    const text = cleanText(entry, 320);
    if (text && !items.includes(text)) items.push(text);
    if (items.length >= maxItems) break;
  }
  return items;
}

function canonical<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  aliases: Record<string, string>,
  fallback: T[number],
): T[number] {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const text = aliases[raw] ?? raw;
  return (allowed as readonly string[]).includes(text)
    ? (text as T[number])
    : fallback;
}

const HEALTH_ALIASES: Record<string, string> = {
  infected: "diseased",
  disease: "diseased",
  sick: "diseased",
  healthy: "healthy",
  ok: "healthy",
  unsure: "uncertain",
  unclear: "uncertain",
  unknown: "uncertain",
};

const PATHOGEN_ALIASES: Record<string, string> = {
  fungus: "fungal",
  fungi: "fungal",
  bacteria: "bacterial",
  bacterium: "bacterial",
  virus: "viral",
  insect: "pest",
  pest_damage: "pest",
  deficiency: "nutrient",
  nutrition: "nutrient",
  weather: "environmental",
  stress: "environmental",
};

const SEVERITY_ALIASES: Record<string, string> = {
  nil: "none",
  no: "none",
  mild: "low",
  light: "low",
  medium: "moderate",
  medium_severity: "moderate",
  severe: "high",
  very_high: "high",
  critical: "high",
  unsure: "unknown",
};

function normaliseConfidence(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const scaled = number > 1 && number <= 100 ? number / 100 : number;
  return Math.min(1, Math.max(0, scaled));
}

/**
 * Turns a model reply into the exact shape the app stores and renders. Returns
 * `null` when the reply contains nothing usable, so the caller can report a
 * failed analysis instead of saving a fake diagnosis.
 */
export function normaliseDiseaseAnalysis(
  value: unknown,
): DiseaseAnalysis | null {
  const record = asRecord(value);

  const healthStatus = canonical(
    record.healthStatus ?? record.health_status,
    DISEASE_HEALTH_STATUSES,
    HEALTH_ALIASES,
    "uncertain",
  );
  const pathogenType = canonical(
    record.pathogenType ?? record.pathogen_type,
    PATHOGEN_TYPES,
    PATHOGEN_ALIASES,
    "unknown",
  );
  let severity = canonical(
    record.severity,
    DISEASE_SEVERITIES,
    SEVERITY_ALIASES,
    healthStatus === "healthy" ? "none" : "unknown",
  );
  if (healthStatus === "healthy") severity = "none";

  const diseaseName =
    cleanText(record.diseaseName ?? record.disease_name, 160) || null;
  const summary = cleanText(record.summary, 900);
  const symptoms = cleanList(record.symptoms);
  const causes = cleanList(record.causes);
  const immediateActions = cleanList(
    record.immediateActions ?? record.immediate_actions,
    8,
  );
  const organicTreatment = cleanList(
    record.organicTreatment ?? record.organic_treatment,
  );
  const chemicalTreatment = cleanList(
    record.chemicalTreatment ?? record.chemical_treatment,
  );
  const prevention = cleanList(record.prevention);
  const lookAlikes = cleanList(record.lookAlikes ?? record.look_alikes, 4);

  if (
    !summary &&
    !diseaseName &&
    symptoms.length === 0 &&
    immediateActions.length === 0
  ) {
    return null;
  }

  return {
    cropName: cleanText(record.cropName ?? record.crop_name, 80) || null,
    plantPart:
      cleanText(record.plantPart ?? record.plant_part, 40) || "plant part",
    healthStatus,
    diseaseName: healthStatus === "healthy" ? null : diseaseName,
    pathogenType: healthStatus === "healthy" ? "unknown" : pathogenType,
    severity,
    confidence: normaliseConfidence(record.confidence),
    summary:
      summary ||
      (healthStatus === "healthy"
        ? "No clear disease symptoms are visible in this photo."
        : "The image shows a plant-health problem, but the model did not add a summary."),
    symptoms,
    causes,
    immediateActions,
    organicTreatment,
    chemicalTreatment,
    prevention,
    lookAlikes,
  };
}

export function confidencePercent(confidence: number): number {
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100);
}
