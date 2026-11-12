import { and, desc, eq, lt } from "drizzle-orm";

import { diseaseScans, type Database, type DiseaseScan } from "@/db";
import type {
  DiseaseAnalysis,
  DiseaseAnalysisSource,
  DiseaseScanDTO,
} from "./disease";

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toDiseaseScanDTO(
  scan: Omit<DiseaseScan, "farmerId" | "imageMime" | "imageData">,
): DiseaseScanDTO {
  return {
    id: scan.id,
    cropId: scan.cropId,
    cropName: scan.cropName,
    plantPart: scan.plantPart,
    note: scan.note,
    subject: scan.subject ?? "plant",
    imageQuality: scan.imageQuality ?? "unknown",
    retakeAdvice: scan.retakeAdvice ?? null,
    healthStatus: scan.healthStatus,
    diseaseName: scan.diseaseName,
    pathogenType: scan.pathogenType,
    severity: scan.severity,
    spreadRisk: scan.spreadRisk ?? "unknown",
    urgency: scan.urgency ?? "monitor",
    confidence: scan.confidence,
    summary: scan.summary,
    symptoms: scan.symptoms ?? [],
    causes: scan.causes ?? [],
    immediateActions: scan.immediateActions ?? [],
    organicTreatment: scan.organicTreatment ?? [],
    chemicalTreatment: scan.chemicalTreatment ?? [],
    prevention: scan.prevention ?? [],
    lookAlikes: scan.lookAlikes ?? [],
    differentials: scan.differentials ?? [],
    monitoring: scan.monitoring ?? null,
    source:
      scan.source === "groq"
        ? "groq"
        : scan.source === "gemini+groq"
          ? "gemini+groq"
          : "gemini",
    model: scan.model,
    imageUrl: `/api/disease/scans/${scan.id}/image`,
    createdAt: toIso(scan.createdAt),
  };
}

export async function listDiseaseScans(
  db: Database,
  farmerId: number,
  options: { limit?: number; beforeId?: number } = {},
): Promise<DiseaseScanDTO[]> {
  const limit = Math.min(50, Math.max(1, options.limit ?? 18));
  const filters = [eq(diseaseScans.farmerId, farmerId)];
  if (options.beforeId && Number.isFinite(options.beforeId)) {
    filters.push(lt(diseaseScans.id, options.beforeId));
  }

  const rows = await db
    .select({
      id: diseaseScans.id,
      cropId: diseaseScans.cropId,
      cropName: diseaseScans.cropName,
      plantPart: diseaseScans.plantPart,
      note: diseaseScans.note,
      subject: diseaseScans.subject,
      imageQuality: diseaseScans.imageQuality,
      retakeAdvice: diseaseScans.retakeAdvice,
      healthStatus: diseaseScans.healthStatus,
      diseaseName: diseaseScans.diseaseName,
      pathogenType: diseaseScans.pathogenType,
      severity: diseaseScans.severity,
      spreadRisk: diseaseScans.spreadRisk,
      urgency: diseaseScans.urgency,
      confidence: diseaseScans.confidence,
      summary: diseaseScans.summary,
      symptoms: diseaseScans.symptoms,
      causes: diseaseScans.causes,
      immediateActions: diseaseScans.immediateActions,
      organicTreatment: diseaseScans.organicTreatment,
      chemicalTreatment: diseaseScans.chemicalTreatment,
      prevention: diseaseScans.prevention,
      lookAlikes: diseaseScans.lookAlikes,
      differentials: diseaseScans.differentials,
      monitoring: diseaseScans.monitoring,
      source: diseaseScans.source,
      model: diseaseScans.model,
      createdAt: diseaseScans.createdAt,
    })
    .from(diseaseScans)
    .where(and(...filters))
    .orderBy(desc(diseaseScans.createdAt), desc(diseaseScans.id))
    .limit(limit);

  return rows.map(toDiseaseScanDTO);
}

export async function createDiseaseScan(
  db: Database,
  input: {
    farmerId: number;
    cropId: number | null;
    cropName: string | null;
    plantPart: string;
    note: string | null;
    imageMime: string;
    imageData: string;
    analysis: DiseaseAnalysis;
    source: DiseaseAnalysisSource;
    model: string | null;
  },
): Promise<DiseaseScanDTO> {
  const { analysis } = input;

  const inserted = await db
    .insert(diseaseScans)
    .values({
      farmerId: input.farmerId,
      cropId: input.cropId,
      cropName: input.cropName,
      plantPart: input.plantPart,
      note: input.note,
      imageMime: input.imageMime,
      imageData: input.imageData,
      subject: analysis.subject,
      imageQuality: analysis.imageQuality,
      retakeAdvice: analysis.retakeAdvice,
      healthStatus: analysis.healthStatus,
      diseaseName: analysis.diseaseName,
      pathogenType: analysis.pathogenType,
      severity: analysis.severity,
      spreadRisk: analysis.spreadRisk,
      urgency: analysis.urgency,
      confidence: analysis.confidence,
      summary: analysis.summary,
      symptoms: analysis.symptoms,
      causes: analysis.causes,
      immediateActions: analysis.immediateActions,
      organicTreatment: analysis.organicTreatment,
      chemicalTreatment: analysis.chemicalTreatment,
      prevention: analysis.prevention,
      lookAlikes: analysis.lookAlikes,
      differentials: analysis.differentials,
      monitoring: analysis.monitoring,
      source: input.source,
      model: input.model,
    })
    .returning();

  return toDiseaseScanDTO(inserted[0]);
}

export async function getDiseaseScanImage(
  db: Database,
  scanId: number,
  farmerId: number,
): Promise<{ mime: string; data: string } | null> {
  const rows = await db
    .select({
      imageMime: diseaseScans.imageMime,
      imageData: diseaseScans.imageData,
    })
    .from(diseaseScans)
    .where(
      and(eq(diseaseScans.id, scanId), eq(diseaseScans.farmerId, farmerId)),
    )
    .limit(1);

  if (rows.length === 0) return null;
  return { mime: rows[0].imageMime, data: rows[0].imageData };
}

export async function deleteDiseaseScan(
  db: Database,
  scanId: number,
  farmerId: number,
): Promise<boolean> {
  const removed = await db
    .delete(diseaseScans)
    .where(
      and(eq(diseaseScans.id, scanId), eq(diseaseScans.farmerId, farmerId)),
    )
    .returning({ id: diseaseScans.id });

  return removed.length > 0;
}
