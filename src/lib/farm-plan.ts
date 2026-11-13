import type { AgroAssessment } from "./agro-advisory";
import type { DailyPlan } from "./daily-tasks";
import type { PestRiskAssessment } from "./pest-risk";
import type { ShoppingSuggestion } from "./recommendations";
import type { SatelliteObservation } from "./satellite";
import type {
  ClimateSummary,
  CropSuitability,
  SoilAnalysis,
  SoilTestInput,
} from "./soil";
import type { CropDTO, FarmDTO } from "./types";
import type { WeatherSnapshot, WeatherWarning } from "./weather";

/** Shared response shape for `GET /api/farm-plan`. */
export interface FarmPlanResponse {
  farm: FarmDTO;
  crop: CropDTO | null;
  weather: WeatherSnapshot | null;
  warnings: WeatherWarning[];
  weatherError: string | null;
  agro: AgroAssessment | null;
  pest: PestRiskAssessment | null;
  soil: SoilAnalysis;
  climate: ClimateSummary | null;
  cropFit: CropSuitability[];
  dailyPlan: DailyPlan;
  shopping: ShoppingSuggestion[];
  generatedAt: string;
}

export interface SoilSaveResponse {
  farm: FarmDTO;
  soil: SoilAnalysis;
}

export interface SoilGetResponse {
  soil: SoilAnalysis;
  raw: SoilTestInput | null;
}

export interface SatelliteResponse {
  configured: boolean;
  observation: SatelliteObservation | null;
  unavailable: { code: string; message: string } | null;
}
