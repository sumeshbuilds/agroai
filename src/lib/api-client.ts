import type {
  CropDTO,
  FarmDTO,
  FarmerDTO,
  GeoPoint,
  WeeklyReportDTO,
} from "./types";
import type {
  CameraDetectionDTO,
  CameraIngestPayload,
  CameraSessionDTO,
} from "./camera";
import type { PestRiskAssessment } from "./pest-risk";
import type { WeatherSnapshot, WeatherWarning } from "./weather";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error ?? `Request failed (${response.status})`,
      response.status,
      payload?.code,
    );
  }

  return payload as T;
}

export interface WeatherResponse {
  farmName: string | null;
  weather: WeatherSnapshot;
  warnings: WeatherWarning[];
}

export interface ReportGenerationResponse {
  generated: WeeklyReportDTO[];
  message?: string;
}

export interface PestRiskResponse {
  crop: CropDTO;
  farmName: string;
  assessment: PestRiskAssessment;
}

export interface RegisterInput {
  name: string;
  pin: string;
  farmId: number;
  cropName: string;
  cropDays: number;
  durationDays?: number;
}

export const api = {
  me: () => request<{ farmer: FarmerDTO | null }>("/api/auth/me"),

  login: (input: { name: string; pin: string }) =>
    request<{ farmer: FarmerDTO }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  register: (input: RegisterInput) =>
    request<{ farmer: FarmerDTO; farm: FarmDTO; crop: CropDTO }>(
      "/api/auth/register",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),

  logout: () =>
    request<{ signedOut: boolean }>("/api/auth/logout", { method: "POST" }),

  listFarms: () => request<{ farms: FarmDTO[] }>("/api/farms"),

  listAvailableFarms: () =>
    request<{ farms: FarmDTO[] }>("/api/farms/available"),

  createFarm: (input: { name: string; points: GeoPoint[] }) =>
    request<{ farm: FarmDTO }>("/api/farms", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getWeatherByFarm: (farmId: number) =>
    request<WeatherResponse>(`/api/weather?farmId=${farmId}`),

  getWeatherByPoint: (lat: number, lng: number) =>
    request<WeatherResponse>(`/api/weather?lat=${lat}&lng=${lng}`),

  listCrops: () => request<{ crops: CropDTO[] }>("/api/crops"),

  createCrop: (input: {
    cropName: string;
    sowingDate: string;
    farmlandId?: number | null;
    growthStage?: string;
    durationDays?: number;
  }) =>
    request<{ crop: CropDTO }>("/api/crops", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getPestRisk: (cropId?: number) =>
    request<PestRiskResponse>(
      `/api/pest-risk${cropId !== undefined ? `?cropId=${cropId}` : ""}`,
    ),

  listCameraSessions: () =>
    request<{ sessions: CameraSessionDTO[] }>("/api/camera/sessions"),

  createCameraSession: (name: string) =>
    request<{ session: CameraSessionDTO }>("/api/camera/sessions", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  getCameraSession: (id: number) =>
    request<{
      session: CameraSessionDTO;
      detections: CameraDetectionDTO[];
    }>(`/api/camera/sessions/${id}`),

  updateCameraSession: (
    id: number,
    input: { status?: "waiting" | "live" | "ended"; name?: string },
  ) =>
    request<{ session: CameraSessionDTO }>(`/api/camera/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteCameraSession: (id: number) =>
    request<{ removed: boolean }>(`/api/camera/sessions/${id}`, {
      method: "DELETE",
    }),

  /** Public (token-scoped) pairing info used by the phone page. */
  getCameraPairing: (token: string) =>
    request<{ session: CameraSessionDTO; farmerName: string }>(
      `/api/camera/stream/${encodeURIComponent(token)}`,
    ),

  /** Uploads one frame + detections from the phone (token auth, no cookie). */
  postCameraFrame: (token: string, payload: CameraIngestPayload) =>
    request<{
      ok: boolean;
      sessionId: number;
      frameUpdatedAt: string | null;
      newDetections: unknown[];
    }>(`/api/camera/stream/${encodeURIComponent(token)}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getCameraNetwork: () =>
    request<{ addresses: Array<{ address: string; interface: string }> }>(
      "/api/camera/network",
    ),

  listReports: (options?: { limit?: number; cropId?: number }) => {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.cropId !== undefined)
      params.set("cropId", String(options.cropId));
    const query = params.toString();
    return request<{ reports: WeeklyReportDTO[] }>(
      `/api/reports${query ? `?${query}` : ""}`,
    );
  },

  generateReport: (cropId?: number) =>
    request<ReportGenerationResponse>("/api/cron/weekly-report", {
      method: "POST",
      body: JSON.stringify(cropId !== undefined ? { cropId } : {}),
    }),
};
