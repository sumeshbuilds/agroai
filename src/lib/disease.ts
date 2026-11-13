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

export const DISEASE_SUBJECTS = ["plant", "not_plant", "unclear"] as const;

export type DiseaseSubject = (typeof DISEASE_SUBJECTS)[number];

export const IMAGE_QUALITIES = ["good", "fair", "poor", "unknown"] as const;

export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

export const SPREAD_RISKS = ["low", "moderate", "high", "unknown"] as const;

export type SpreadRisk = (typeof SPREAD_RISKS)[number];

export const DISEASE_URGENCIES = ["monitor", "act_soon", "act_now"] as const;

export type DiseaseUrgency = (typeof DISEASE_URGENCIES)[number];

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

export interface DifferentialDiagnosis {
  name: string;
  /** 0–1 */
  confidence: number;
  note: string | null;
}

export interface DiseaseAnalysis {
  /** What the model thinks the photo actually shows. */
  subject: DiseaseSubject;
  /** How usable the photo is as a diagnostic image. */
  imageQuality: ImageQuality;
  /** Plain-language retake instructions when the photo is weak. */
  retakeAdvice: string | null;
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
  /** Ranked alternatives the photo cannot fully rule out. */
  differentials: DifferentialDiagnosis[];
  spreadRisk: SpreadRisk;
  urgency: DiseaseUrgency;
  /** When to inspect the same plant again, in the farmer's words. */
  monitoring: string | null;
}

export type DiseaseAnalysisSource =
  | "gemini"
  | "groq"
  | "classifier"
  | "gemini+groq"
  | "gemini+classifier"
  | "groq+classifier"
  | "gemini+groq+classifier";

export interface DiseaseScanDTO extends DiseaseAnalysis {
  id: number;
  cropId: number | null;
  note: string | null;
  source: DiseaseAnalysisSource;
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

export const SPREAD_RISK_META: Record<
  SpreadRisk,
  { label: string; tone: "leaf" | "warn" | "danger" | "muted" }
> = {
  low: { label: "Low spread risk", tone: "leaf" },
  moderate: { label: "Can spread — isolate it", tone: "warn" },
  high: { label: "Spreads fast — act now", tone: "danger" },
  unknown: { label: "Spread risk unclear", tone: "muted" },
};

export const URGENCY_META: Record<
  DiseaseUrgency,
  { label: string; tone: "leaf" | "warn" | "danger" }
> = {
  monitor: { label: "Watch and re-check", tone: "leaf" },
  act_soon: { label: "Act within 2–3 days", tone: "warn" },
  act_now: { label: "Act today", tone: "danger" },
};

export const IMAGE_QUALITY_META: Record<
  ImageQuality,
  { label: string; tone: "leaf" | "warn" | "danger" | "muted" }
> = {
  good: { label: "Clear and sharp", tone: "leaf" },
  fair: { label: "Usable photo", tone: "warn" },
  poor: { label: "Unclear photo", tone: "danger" },
  unknown: { label: "Photo quality not checked", tone: "muted" },
};

export const SUBJECT_META: Record<
  DiseaseSubject,
  { label: string; tone: "leaf" | "warn" | "danger" }
> = {
  plant: { label: "Plant photo", tone: "leaf" },
  not_plant: { label: "Not a plant photo", tone: "danger" },
  unclear: { label: "Photo subject unclear", tone: "warn" },
};

export const DISEASE_DISCLAIMER =
  "This is an AI visual check, not a laboratory test. Confirm the diagnosis with your local agriculture officer or KVK before spending money on pesticides.";

export const DEFAULT_RETAKE_ADVICE =
  "Take a new photo in daylight, fill the frame with the affected leaf, stem or fruit, and hold the phone still until it focuses.";

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

const SUBJECT_ALIASES: Record<string, string> = {
  plant: "plant",
  leaf: "plant",
  crop: "plant",
  not_plant: "not_plant",
  non_plant: "not_plant",
  animal: "not_plant",
  person: "not_plant",
  object: "not_plant",
  other: "not_plant",
  unclear: "unclear",
  unsure: "unclear",
  unknown: "unclear",
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

const IMAGE_QUALITY_ALIASES: Record<string, string> = {
  ok: "good",
  clear: "good",
  sharp: "good",
  usable: "fair",
  acceptable: "fair",
  blurry: "poor",
  blurred: "poor",
  dark: "poor",
  low: "poor",
  bad: "poor",
  unsure: "unknown",
};

const SPREAD_ALIASES: Record<string, string> = {
  none: "low",
  low: "low",
  mild: "low",
  medium: "moderate",
  moderate: "moderate",
  severe: "high",
  high: "high",
  critical: "high",
  unsure: "unknown",
};

const URGENCY_ALIASES: Record<string, string> = {
  watch: "monitor",
  monitor: "monitor",
  routine: "monitor",
  low: "monitor",
  soon: "act_soon",
  moderate: "act_soon",
  high: "act_soon",
  urgent: "act_now",
  immediately: "act_now",
  critical: "act_now",
  now: "act_now",
};

function normaliseConfidence(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const scaled = number > 1 && number <= 100 ? number / 100 : number;
  return Math.min(1, Math.max(0, scaled));
}

function diagnosisKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|a|an|disease|infection|problem|on|in)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameDiagnosis(a: string, b: string): boolean {
  const left = diagnosisKey(a);
  const right = diagnosisKey(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function cleanDifferentials(
  value: unknown,
  primaryName: string | null,
): DifferentialDiagnosis[] {
  if (!Array.isArray(value)) return [];

  const byName = new Map<string, DifferentialDiagnosis>();

  for (const entry of value) {
    const record = asRecord(entry);
    const rawName =
      typeof entry === "string"
        ? entry
        : (record.name ?? record.diseaseName ?? record.disease_name);
    const name = cleanText(rawName, 160);
    if (!name) continue;
    if (primaryName && sameDiagnosis(name, primaryName)) continue;

    const confidence = normaliseConfidence(
      typeof entry === "string" ? 0 : record.confidence,
    );
    const note =
      cleanText(
        typeof entry === "string"
          ? ""
          : (record.note ?? record.reason ?? record.why),
        240,
      ) || null;

    const key = diagnosisKey(name);
    const existing = byName.get(key);
    if (!existing || confidence > existing.confidence) {
      byName.set(key, { name, confidence, note });
    }
  }

  return [...byName.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);
}

function spreadRank(value: SpreadRisk): number {
  return value === "high" ? 3 : value === "moderate" ? 2 : value === "low" ? 1 : 0;
}

function urgencyRank(value: DiseaseUrgency): number {
  return value === "act_now" ? 3 : value === "act_soon" ? 2 : 1;
}

function maxSpread(a: SpreadRisk, b: SpreadRisk): SpreadRisk {
  return spreadRank(a) >= spreadRank(b) ? a : b;
}

function maxUrgency(a: DiseaseUrgency, b: DiseaseUrgency): DiseaseUrgency {
  return urgencyRank(a) >= urgencyRank(b) ? a : b;
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

  let healthStatus = canonical(
    record.healthStatus ?? record.health_status,
    DISEASE_HEALTH_STATUSES,
    HEALTH_ALIASES,
    "uncertain",
  );
  const subject = canonical(
    record.subject ?? record.imageSubject ?? record.image_subject,
    DISEASE_SUBJECTS,
    SUBJECT_ALIASES,
    "unclear",
  );
  const imageQuality = canonical(
    record.imageQuality ?? record.image_quality,
    IMAGE_QUALITIES,
    IMAGE_QUALITY_ALIASES,
    "unknown",
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

  let diseaseName =
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
  let spreadRisk = canonical(
    record.spreadRisk ?? record.spread_risk ?? record.contagious,
    SPREAD_RISKS,
    SPREAD_ALIASES,
    "unknown",
  );
  let urgency = canonical(
    record.urgency,
    DISEASE_URGENCIES,
    URGENCY_ALIASES,
    "monitor",
  );
  let monitoring =
    cleanText(
      record.monitoring ?? record.monitorIn ?? record.monitor_in ?? record.monitoringAdvice,
      200,
    ) || null;
  let retakeAdvice =
    cleanText(record.retakeAdvice ?? record.retake_advice, 300) || null;

  const confidence = normaliseConfidence(record.confidence);

  // A photo that does not show a plant cannot carry a diagnosis. Keep the scan
  // (and its retake advice) instead of guessing which crop disease it is.
  if (subject === "not_plant") {
    healthStatus = "uncertain";
    diseaseName = null;
    severity = "none";
    spreadRisk = "low";
    urgency = "monitor";
    monitoring = null;
    retakeAdvice =
      retakeAdvice ??
      "This photo does not clearly show a plant. Point the camera at the affected leaf, stem or fruit and try again.";
  }

  if (healthStatus === "healthy") {
    diseaseName = null;
    severity = "none";
    spreadRisk = "low";
    urgency = "monitor";
    monitoring = monitoring ?? "Check the same plant again in 7 days.";
  }

  // A diagnosis at very low confidence is not a diagnosis. Show it as an
  // uncertain result so the UI does not present a guess as fact.
  if (healthStatus === "diseased" && confidence < 0.4) {
    healthStatus = "uncertain";
    spreadRisk = spreadRisk === "low" ? "unknown" : spreadRisk;
    urgency = "monitor";
  }

  if (
    (imageQuality === "poor" ||
      (healthStatus === "uncertain" && confidence < 0.45)) &&
    !retakeAdvice
  ) {
    retakeAdvice = DEFAULT_RETAKE_ADVICE;
  }

  if (healthStatus === "diseased") {
    if (urgency === "monitor") {
      urgency = severity === "high" ? "act_now" : severity === "moderate" ? "act_soon" : "monitor";
    }
    if (spreadRisk === "unknown" && severity === "high") spreadRisk = "high";
    monitoring = monitoring ?? "Check the same plant again in 2–3 days.";
  }

  let differentials = cleanDifferentials(
    record.differentials ??
      record.differentialDiagnosis ??
      record.differential_diagnosis ??
      record.alternatives,
    diseaseName,
  );

  if (healthStatus === "healthy" || subject === "not_plant") {
    differentials = [];
  }

  if (
    !summary &&
    !diseaseName &&
    symptoms.length === 0 &&
    immediateActions.length === 0
  ) {
    return null;
  }

  return {
    subject,
    imageQuality,
    retakeAdvice,
    cropName: cleanText(record.cropName ?? record.crop_name, 80) || null,
    plantPart:
      cleanText(record.plantPart ?? record.plant_part, 40) || "plant part",
    healthStatus,
    diseaseName: healthStatus === "healthy" ? null : diseaseName,
    pathogenType: healthStatus === "healthy" ? "unknown" : pathogenType,
    severity,
    confidence,
    summary:
      summary ||
      (subject === "not_plant"
        ? "This photo does not clearly show a plant, so no diagnosis can be made."
        : healthStatus === "healthy"
          ? "No clear disease symptoms are visible in this photo."
          : "The image shows a plant-health problem, but the model did not add a summary."),
    symptoms,
    causes,
    immediateActions,
    organicTreatment,
    chemicalTreatment,
    prevention,
    lookAlikes,
    differentials,
    spreadRisk,
    urgency,
    monitoring,
  };
}

/**
 * Combines two independent reads of the same photo.
 *
 * Agreement raises confidence; disagreement keeps the stronger diagnosis but
 * lowers its confidence and lists the other opinion as a differential. The
 * result is deliberately conservative — the app should say "not sure" rather
 * than invent certainty.
 */
export function mergeDiseaseAnalyses(
  primary: DiseaseAnalysis,
  secondary: DiseaseAnalysis,
): { analysis: DiseaseAnalysis; agreed: boolean } {
  const primaryName = primary.diseaseName;
  const secondaryName = secondary.diseaseName;
  const namesMatch = Boolean(
    primaryName &&
      secondaryName &&
      sameDiagnosis(primaryName, secondaryName),
  );
  const agreed =
    (primary.healthStatus === "healthy" &&
      secondary.healthStatus === "healthy") ||
    (primary.healthStatus === "diseased" &&
      secondary.healthStatus === "diseased" &&
      namesMatch) ||
    (primary.healthStatus === "uncertain" &&
      secondary.healthStatus === "uncertain" &&
      (!primaryName || !secondaryName || namesMatch));

  const extraDifferentials: DifferentialDiagnosis[] = [];
  if (secondaryName && !sameDiagnosis(secondaryName, primaryName ?? "")) {
    extraDifferentials.push({
      name: secondaryName,
      confidence: secondary.confidence,
      note: "Suggested by the second AI check.",
    });
  }
  for (const item of secondary.differentials) {
    extraDifferentials.push(item);
  }

  const mergedDifferentials = cleanDifferentials(
    [...primary.differentials, ...extraDifferentials],
    primary.healthStatus === "healthy" ? null : primaryName,
  );

  if (agreed) {
    const boosted =
      primary.healthStatus === "diseased" &&
      secondary.healthStatus === "diseased" &&
      primary.confidence >= 0.5 &&
      secondary.confidence >= 0.5
        ? Math.min(1, Math.max(primary.confidence, secondary.confidence) + 0.08)
        : Math.max(primary.confidence, secondary.confidence);

    return {
      agreed: true,
      analysis: finaliseMerged({
        ...primary,
        subject: mergeSubject(primary.subject, secondary.subject),
        imageQuality: worseImageQuality(
          primary.imageQuality,
          secondary.imageQuality,
        ),
        retakeAdvice: primary.retakeAdvice ?? secondary.retakeAdvice,
        confidence: boosted,
        severity:
          severityRank(secondary.severity) > severityRank(primary.severity)
            ? secondary.severity
            : primary.severity,
        spreadRisk: maxSpread(primary.spreadRisk, secondary.spreadRisk),
        urgency: maxUrgency(primary.urgency, secondary.urgency),
        monitoring: primary.monitoring ?? secondary.monitoring,
        differentials: mergedDifferentials,
        summary:
          primary.summary.length >= secondary.summary.length
            ? primary.summary
            : secondary.summary,
      }),
    };
  }

  // Two different answers mean the photo is ambiguous. Prefer the higher
  // confidence read, but reduce certainty and expose both candidates.
  const secondaryWins =
    secondary.confidence > primary.confidence + 0.15 &&
    secondary.healthStatus !== "healthy";
  const winner = secondaryWins ? secondary : primary;
  const loser = secondaryWins ? primary : secondary;
  const disagreeConfidence = Math.max(
    0.15,
    Math.min(0.85, winner.confidence - 0.12),
  );
  const winnerSaysHealthyLoserSeesDisease =
    winner.healthStatus === "healthy" && loser.healthStatus === "diseased";
  const subjectConflict =
    (winner.subject === "not_plant" && loser.subject === "plant") ||
    (winner.subject === "plant" && loser.subject === "not_plant");

  return {
    agreed: false,
    analysis: finaliseMerged({
      ...winner,
      subject: mergeSubject(winner.subject, loser.subject),
      imageQuality: worseImageQuality(
        winner.imageQuality,
        loser.imageQuality,
      ),
      retakeAdvice:
        winner.retakeAdvice ??
        loser.retakeAdvice ??
        "The two AI checks disagreed. Take a closer photo in good light, and include both healthy and damaged tissue.",
      confidence: disagreeConfidence,
      healthStatus: subjectConflict
        ? "uncertain"
        : winnerSaysHealthyLoserSeesDisease
          ? "uncertain"
          : winner.healthStatus,
      diseaseName: subjectConflict
        ? null
        : winnerSaysHealthyLoserSeesDisease
          ? (loser.diseaseName ?? winner.diseaseName)
          : winner.diseaseName,
      severity: subjectConflict
        ? "none"
        : winnerSaysHealthyLoserSeesDisease
          ? loser.severity
          : winner.severity,
      spreadRisk: maxSpread(winner.spreadRisk, loser.spreadRisk),
      urgency: maxUrgency(winner.urgency, loser.urgency),
      differentials: cleanDifferentials(
        [
          ...winner.differentials,
          ...loser.differentials,
          ...(loser.diseaseName
            ? [
                {
                  name: loser.diseaseName,
                  confidence: loser.confidence,
                  note: "Suggested by the second AI check.",
                },
              ]
            : []),
        ],
        winner.healthStatus === "healthy"
          ? (loser.diseaseName ?? null)
          : winner.diseaseName,
      ),
    }),
  };
}

function mergeSubject(a: DiseaseSubject, b: DiseaseSubject): DiseaseSubject {
  if (a === b) return a;
  if (
    (a === "plant" && b === "unclear") ||
    (a === "unclear" && b === "plant")
  ) {
    return "plant";
  }
  if (
    (a === "not_plant" && b === "unclear") ||
    (a === "unclear" && b === "not_plant")
  ) {
    return "not_plant";
  }
  return "unclear";
}

function worseImageQuality(a: ImageQuality, b: ImageQuality): ImageQuality {
  const rank = (value: ImageQuality) =>
    value === "poor" ? 3 : value === "fair" ? 2 : value === "good" ? 1 : 0;
  return rank(a) >= rank(b) ? a : b;
}

/** Re-applies the same guards as a single model reply. */
function finaliseMerged(analysis: DiseaseAnalysis): DiseaseAnalysis {
  return normaliseDiseaseAnalysis(analysis) ?? analysis;
}

function severityRank(value: DiseaseSeverity): number {
  return value === "high" ? 3 : value === "moderate" ? 2 : value === "low" ? 1 : 0;
}

export function confidencePercent(confidence: number): number {
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100);
}
