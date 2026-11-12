import { getDb } from "@/db";
import { getSessionFarmer } from "@/lib/auth";
import {
  analysePlantImage,
  DiseaseAiUnavailableError,
  isDiseaseAiConfigured,
  type DiseaseContext,
} from "@/lib/disease-ai";
import {
  cropContext,
  knownThreatsForCrop,
  loadWeatherContext,
} from "@/lib/disease-context";
import { createDiseaseScan } from "@/lib/disease-queries";
import { isPlantPart, type PlantPart } from "@/lib/disease";
import { fail, handleRouteError, ok } from "@/lib/http";
import { getCropWithFarm, toCropDTO } from "@/lib/queries";

export const maxDuration = 60;

/** Input cap — the browser compresses to well under this before uploading. */
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function detectedMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * POST /api/disease/detect
 * multipart/form-data: image (JPEG/PNG/WebP), cropId?, cropName?, plantPart, note?
 */
export async function POST(request: Request) {
  try {
    const farmer = await getSessionFarmer();
    if (!farmer) {
      return fail("Sign in to scan a plant.", 401, { code: "AUTH_REQUIRED" });
    }

    if (!isDiseaseAiConfigured()) {
      return fail(
        "The plant doctor is not configured yet. Add GEMINI_API_KEY to .env.local and restart the server.",
        503,
        { code: "DISEASE_AI_NOT_CONFIGURED" },
      );
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return fail("Send the photo as multipart/form-data.", 400);
    }

    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0) {
      return fail("Attach a photo of the affected plant part.", 400);
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return fail(
        "That photo is too large. Please use a photo under 2.5 MB — the camera page compresses automatically.",
        413,
        { code: "IMAGE_TOO_LARGE" },
      );
    }

    const declaredMime = image.type && ALLOWED_MIME.has(image.type) ? image.type : null;
    const bytes = new Uint8Array(await image.arrayBuffer());
    const mimeType = detectedMime(bytes) ?? declaredMime;

    if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
      return fail(
        "Use a JPEG, PNG or WebP photo of the plant. Other formats are not supported.",
        415,
        { code: "UNSUPPORTED_IMAGE" },
      );
    }

    const db = getDb();

    const cropIdRaw = Number(form.get("cropId"));
    const cropId =
      Number.isInteger(cropIdRaw) && cropIdRaw > 0 ? cropIdRaw : null;

    let cropName =
      typeof form.get("cropName") === "string"
        ? String(form.get("cropName")).trim().slice(0, 80) || null
        : null;

    let cropRow: Awaited<ReturnType<typeof getCropWithFarm>> = null;

    if (cropId !== null) {
      const owned = await getCropWithFarm(db, cropId, farmer.id);
      if (!owned) {
        return fail("That crop was not found on your account.", 404, {
          code: "CROP_NOT_FOUND",
        });
      }
      cropRow = owned;
      cropName = owned.crop.cropName;
    }

    const plantPartRaw = form.get("plantPart");
    const plantPart: PlantPart = isPlantPart(plantPartRaw)
      ? plantPartRaw
      : "leaf";

    const noteRaw = form.get("note");
    const note =
      typeof noteRaw === "string"
        ? noteRaw.replace(/\s+/g, " ").trim().slice(0, 400) || null
        : null;

    // Crop stage + live weather give the vision model a factual prior, which
    // makes fungal/bacterial/pest rankings much more reliable. Both are
    // best-effort: a missing farm or slow forecast must not block the scan.
    let context: DiseaseContext | null = null;
    if (cropRow) {
      const crop = toCropDTO({
        ...cropRow.crop,
        farmlandName: cropRow.farm?.name ?? null,
      });
      const weather = cropRow.farm
        ? await loadWeatherContext(cropRow.farm)
        : null;
      context = cropContext({
        cropName: crop.cropName,
        ageDays: crop.ageDays,
        durationDays: crop.durationDays,
        weather,
      });
    } else if (cropName) {
      context = {
        cropName,
        knownThreats: knownThreatsForCrop(cropName),
      };
    }

    const result = await analysePlantImage({
      imageBase64: Buffer.from(bytes).toString("base64"),
      mimeType,
      cropName,
      plantPart,
      note,
      context,
    });

    const scan = await createDiseaseScan(db, {
      farmerId: farmer.id,
      cropId,
      cropName: cropName ?? result.analysis.cropName,
      plantPart,
      note,
      imageMime: mimeType,
      imageData: Buffer.from(bytes).toString("base64"),
      analysis: result.analysis,
      source: result.source,
      model: result.model,
    });

    return ok({ scan }, { status: 201 });
  } catch (error) {
    if (error instanceof DiseaseAiUnavailableError) {
      return fail(error.message, 502, { code: "DISEASE_AI_UNAVAILABLE" });
    }
    return handleRouteError(error);
  }
}
