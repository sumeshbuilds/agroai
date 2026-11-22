/**
 * Server-side Pl@ntNet client.
 *
 * Two independent Pl@ntNet models are used for one photo:
 *   - `/v2/identify/{project}` names the plant species (the flagship engine);
 *   - `/v2/diseases/identify`  names probable diseases by EPPO code.
 *
 * Both are best-effort: a missing key, a quota error or a timeout returns an
 * outcome object instead of throwing, so the scan still renders the parts that
 * did work. Only a "not a plant" rejection is treated as a real answer.
 *
 * Docs: https://my.plantnet.org/doc/api/identify and /doc/api/diseases
 */

import type { PlantDiseaseMatch, PlantIdentification, PlantSpeciesMatch } from "./disease";

const DEFAULT_BASE_URL = "https://my-api.plantnet.org";
const DEFAULT_PROJECT = "all";
const DEFAULT_LANG = "en";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_ALTERNATIVES = 4;
const NB_RESULTS = 5;

export interface PlantNetOutcome {
  /** Null when Pl@ntNet was not configured or every call failed. */
  identification: PlantIdentification | null;
  /** True when Pl@ntNet rejected the photo as a non-plant. */
  rejected: boolean;
  /** True when Pl@ntNet was configured but no call succeeded. */
  failed: boolean;
  /** Human-readable reason for a failure, for logs only. */
  error: string | null;
}

export interface PlantNetInput {
  /** Raw base64 (no `data:` prefix). */
  imageBase64: string;
  mimeType: string;
  /** Affected plant part, used to pick Pl@ntNet's organ hint. */
  plantPart?: string | null;
}

export function isPlantNetConfigured(): boolean {
  return Boolean(apiKey());
}

function apiKey(): string | null {
  return (
    process.env.PLANTNET_API_KEY?.trim() ||
    process.env.PLANTNET_KEY?.trim() ||
    null
  );
}

function baseUrl(): string {
  return (process.env.PLANTNET_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
}

function project(): string {
  return process.env.PLANTNET_PROJECT?.trim() || DEFAULT_PROJECT;
}

function lang(): string {
  return process.env.PLANTNET_LANG?.trim() || DEFAULT_LANG;
}

function timeoutMs(): number {
  const value = Number(process.env.PLANTNET_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 3_000 && value <= 55_000
    ? value
    : DEFAULT_TIMEOUT_MS;
}

/** Maps the app's plant part to a Pl@ntNet organ code. */
export function organForPlantPart(part?: string | null): string {
  switch ((part ?? "").toLowerCase()) {
    case "leaf":
      return "leaf";
    case "flower":
      return "flower";
    case "fruit":
      return "fruit";
    default:
      return "auto";
  }
}

/* -------------------------------------------------------------------------- */
/* Small defensive helpers                                                    */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function stringList(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const text = cleanText(entry, 120);
    if (text && !out.includes(text)) out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/* -------------------------------------------------------------------------- */
/* HTTP                                                                       */
/* -------------------------------------------------------------------------- */

type CallResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "rejected" }
  | { kind: "error"; status: number; message: string };

function describeStatus(status: number, detail: string): string {
  if (status === 401 || status === 403) {
    return `Pl@ntNet rejected the API key (HTTP ${status}). Check PLANTNET_API_KEY.`;
  }
  if (status === 429) {
    return "Pl@ntNet daily quota reached. Try again tomorrow or raise the quota.";
  }
  if (status === 400) {
    return `Pl@ntNet rejected the request (HTTP 400): ${detail}`;
  }
  return `Pl@ntNet error (HTTP ${status}): ${detail}`;
}

async function postOnce(
  url: string,
  field: string,
  input: PlantNetInput,
  organ: string,
): Promise<CallResult<unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const form = new FormData();
    const bytes = Buffer.from(input.imageBase64, "base64");
    form.append(
      field,
      new Blob([bytes], { type: input.mimeType || "image/jpeg" }),
      "plant.jpg",
    );
    form.append("organs", organ);

    const response = await fetch(url, {
      method: "POST",
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });

    // A 404 is Pl@ntNet's "species not found" — the image is not a plant.
    if (response.status === 404) return { kind: "rejected" };

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      return {
        kind: "error",
        status: response.status,
        message: describeStatus(response.status, detail),
      };
    }

    const json = await response.json().catch(() => null);
    if (!json) {
      return {
        kind: "error",
        status: 0,
        message: "Pl@ntNet returned an empty response.",
      };
    }
    return { kind: "ok", value: json };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      kind: "error",
      status: 0,
      message: aborted
        ? "Pl@ntNet timed out."
        : "Could not reach Pl@ntNet. Check the network and try again.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends one image. The species route uses the `images` part; a few Pl@ntNet
 * deployments expose the disease route as `image`, so we fall back on a 400.
 */
async function postImage(
  url: string,
  input: PlantNetInput,
  organ: string,
): Promise<CallResult<unknown>> {
  const first = await postOnce(url, "images", input, organ);
  if (first.kind !== "error" || first.status !== 400) return first;
  return postOnce(url, "image", input, organ);
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

interface SpeciesValue {
  best: PlantSpeciesMatch | null;
  alternatives: PlantSpeciesMatch[];
  organ: string | null;
  version: string | null;
  project: string;
}

interface DiseaseValue {
  diseases: PlantDiseaseMatch[];
  version: string | null;
}

function parseSpeciesMatch(entry: unknown): PlantSpeciesMatch | null {
  const record = asRecord(entry);
  const species = asRecord(record.species);
  const scientificName =
    cleanText(species.scientificName, 160) ||
    cleanText(species.scientificNameWithoutAuthor, 160);
  if (!scientificName) return null;

  return {
    scientificName,
    commonNames: stringList(species.commonNames),
    family: cleanText(asRecord(species.family).scientificName, 80) || null,
    genus: cleanText(asRecord(species.genus).scientificName, 80) || null,
    score: clamp01(Number(record.score)),
    gbifId: cleanText(asRecord(record.gbif).id, 40) || null,
  };
}

function parseSpecies(json: unknown): SpeciesValue | null {
  const record = asRecord(json);
  const results = Array.isArray(record.results) ? record.results : [];
  const matches = results
    .map(parseSpeciesMatch)
    .filter((match): match is PlantSpeciesMatch => match !== null);

  const best = matches[0] ?? null;
  // A species route that returned no parseable species and no explicit reject
  // is unreadable, not "no plant".
  if (!best) return null;

  const predictedOrgans = Array.isArray(record.predictedOrgans)
    ? record.predictedOrgans
    : [];

  return {
    best,
    alternatives: matches.slice(1, 1 + MAX_ALTERNATIVES),
    organ: cleanText(asRecord(predictedOrgans[0]).organ, 24) || null,
    version: cleanText(record.version, 60) || null,
    project: cleanText(asRecord(record.query).project, 60) || project(),
  };
}

function parseDisease(json: unknown): DiseaseValue {
  const record = asRecord(json);
  const results = Array.isArray(record.results) ? record.results : [];
  const diseases: PlantDiseaseMatch[] = [];

  for (const entry of results) {
    const row = asRecord(entry);
    // `name` is the EPPO code; `description`/`label` is the readable name.
    const label =
      cleanText(row.description, 200) ||
      cleanText(row.label, 200) ||
      cleanText(row.name, 200);
    if (!label) continue;
    diseases.push({
      code: cleanText(row.name, 24) || null,
      label,
      score: clamp01(Number(row.score)),
    });
  }

  diseases.sort((a, b) => b.score - a.score);
  return {
    diseases: diseases.slice(0, 5),
    version: cleanText(record.version, 60) || null,
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

function identifyUrl(): string {
  const params = new URLSearchParams({
    "api-key": apiKey() ?? "",
    lang: lang(),
    "nb-results": String(NB_RESULTS),
  });
  return `${baseUrl()}/v2/identify/${encodeURIComponent(project())}?${params}`;
}

function diseaseUrl(): string {
  const params = new URLSearchParams({
    "api-key": apiKey() ?? "",
    lang: lang(),
    "nb-results": String(NB_RESULTS),
  });
  return `${baseUrl()}/v2/diseases/identify?${params}`;
}

async function callSpecies(input: PlantNetInput, organ: string) {
  if (!apiKey()) {
    return { kind: "error", status: 0, message: "Pl@ntNet is not configured." } as CallResult<SpeciesValue>;
  }
  const outcome = await postImage(identifyUrl(), input, organ);
  if (outcome.kind !== "ok") return outcome as CallResult<SpeciesValue>;
  const parsed = parseSpecies(outcome.value);
  if (!parsed) {
    return {
      kind: "error",
      status: 0,
      message: "Pl@ntNet returned an unreadable identification.",
    } as CallResult<SpeciesValue>;
  }
  return { kind: "ok", value: parsed } as CallResult<SpeciesValue>;
}

async function callDisease(input: PlantNetInput, organ: string) {
  if (!apiKey()) {
    return { kind: "error", status: 0, message: "Pl@ntNet is not configured." } as CallResult<DiseaseValue>;
  }
  const outcome = await postImage(diseaseUrl(), input, organ);
  if (outcome.kind !== "ok") return outcome as CallResult<DiseaseValue>;
  return { kind: "ok", value: parseDisease(outcome.value) } as CallResult<DiseaseValue>;
}

/**
 * Runs both Pl@ntNet models on one photo. Never throws.
 */
export async function identifyWithPlantNet(
  input: PlantNetInput,
): Promise<PlantNetOutcome> {
  if (!apiKey()) {
    return { identification: null, rejected: false, failed: false, error: null };
  }

  const organ = organForPlantPart(input.plantPart);
  const [species, disease] = await Promise.all([
    callSpecies(input, organ),
    callDisease(input, organ),
  ]);

  const speciesOk = species.kind === "ok";
  const diseaseOk = disease.kind === "ok";
  const rejected =
    species.kind === "rejected" ||
    (!speciesOk && disease.kind === "rejected");

  if (!speciesOk && !diseaseOk && !rejected) {
    const message =
      species.kind === "error"
        ? species.message
        : disease.kind === "error"
          ? disease.message
          : "Pl@ntNet did not answer.";
    return { identification: null, rejected: false, failed: true, error: message };
  }

  const bestSpecies = speciesOk ? species.value.best : null;

  const identification: PlantIdentification = {
    provider: "plantnet",
    project: speciesOk ? species.value.project : project(),
    scientificName: bestSpecies?.scientificName ?? null,
    commonNames: bestSpecies?.commonNames ?? [],
    family: bestSpecies?.family ?? null,
    genus: bestSpecies?.genus ?? null,
    score: bestSpecies?.score ?? 0,
    gbifId: bestSpecies?.gbifId ?? null,
    alternatives: speciesOk ? species.value.alternatives : [],
    diseases: diseaseOk ? disease.value.diseases : [],
    organ: speciesOk ? species.value.organ : null,
    engineVersion: speciesOk
      ? species.value.version
      : diseaseOk
        ? disease.value.version
        : null,
    rejected,
  };

  return { identification, rejected, failed: false, error: null };
}
