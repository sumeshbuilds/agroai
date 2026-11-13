/**
 * Soil and crop-fit engine.
 *
 * The farmer can enter the values printed on an Indian Soil Health Card
 * (pH, EC, organic carbon, available N/P/K and, when known, sand/clay/silt).
 * Those measured values are combined with rainfall/temperature normals for the
 * farm's coordinates to rank crops that are actually grown in Kalahandi and
 * similar rain-fed districts.
 *
 * Nothing here invents a soil test: when a value is missing the result is
 * labelled `estimated` and the reason is shown in the UI.
 */

export type SoilTexture =
  | "sandy"
  | "loamy_sand"
  | "sandy_loam"
  | "loam"
  | "silt_loam"
  | "clay_loam"
  | "clay";

export const SOIL_TEXTURE_META: Record<
  SoilTexture,
  { label: string; short: string; drainage: "fast" | "good" | "slow" | "poor" }
> = {
  sandy: { label: "Sandy", short: "sandy", drainage: "fast" },
  loamy_sand: { label: "Loamy sand", short: "loamy sand", drainage: "fast" },
  sandy_loam: { label: "Sandy loam", short: "sandy loam", drainage: "good" },
  loam: { label: "Loam", short: "loam", drainage: "good" },
  silt_loam: { label: "Silt loam", short: "silt loam", drainage: "slow" },
  clay_loam: { label: "Clay loam", short: "clay loam", drainage: "slow" },
  clay: { label: "Clay", short: "clay", drainage: "poor" },
};

export interface SoilTestInput {
  ph?: number | null;
  ec?: number | null;
  /** Organic carbon, %. */
  organicCarbon?: number | null;
  /** Available nitrogen, kg/ha. */
  nitrogen?: number | null;
  /** Available phosphorus (P₂O₅), kg/ha. */
  phosphorus?: number | null;
  /** Available potassium (K₂O), kg/ha. */
  potassium?: number | null;
  sandPct?: number | null;
  clayPct?: number | null;
  siltPct?: number | null;
  texture?: SoilTexture | null;
  testedAt?: string | null;
}

export type NutrientLevel = "low" | "medium" | "high" | "unknown";

export interface SoilRating {
  key: "nitrogen" | "phosphorus" | "potassium" | "organicCarbon";
  label: string;
  value: number | null;
  unit: string;
  level: NutrientLevel;
  note: string;
}

export interface SoilIssue {
  key: string;
  title: string;
  detail: string;
  action: string;
  severity: "warning" | "info";
}

export interface SoilAnalysis {
  source: "soil-health-card" | "estimated" | "missing";
  texture: SoilTexture | null;
  textureLabel: string | null;
  sandPct: number | null;
  clayPct: number | null;
  siltPct: number | null;
  ph: number | null;
  ec: number | null;
  organicCarbon: number | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  ratings: SoilRating[];
  phStatus: "strongly acidic" | "acidic" | "neutral" | "alkaline" | "strongly alkaline" | "unknown";
  ecStatus: "normal" | "slightly saline" | "saline" | "unknown";
  issues: SoilIssue[];
  /** 0–100, a rough health score — not a yield prediction. */
  score: number;
  summary: string;
  testedAt: string | null;
}

export interface ClimateSummary {
  annualRainfallMm: number | null;
  meanTempC: number | null;
  /** Warmest month mean, used for heat-sensitive crops. */
  maxMonthlyTempC: number | null;
  source: "archive" | "forecast" | "none";
  capturedAt: string;
}

export type CropSeason = "kharif" | "rabi" | "zaid" | "perennial";

export type WaterNeed = "low" | "medium" | "high";

export interface CropRequirement {
  name: string;
  emoji: string;
  season: CropSeason;
  durationDays: number;
  ph: [number, number];
  textures: SoilTexture[];
  waterNeed: WaterNeed;
  /** Seasonal rainfall range, mm. */
  rainfallMm: [number, number];
  tempC: [number, number];
  /** Months (1–12) when sowing normally starts in Odisha. */
  sowingMonths: number[];
  note: string;
}

export const CROP_REQUIREMENTS: CropRequirement[] = [
  {
    name: "Paddy (Rice)",
    emoji: "🌾",
    season: "kharif",
    durationDays: 120,
    ph: [5.5, 7.5],
    textures: ["clay_loam", "clay", "silt_loam"],
    waterNeed: "high",
    rainfallMm: [900, 2000],
    tempC: [20, 35],
    sowingMonths: [6, 7],
    note: "Best where water can be held. Heavy clay plots and assured irrigation suit it most.",
  },
  {
    name: "Maize",
    emoji: "🌽",
    season: "kharif",
    durationDays: 100,
    ph: [5.8, 7.5],
    textures: ["sandy_loam", "loam", "clay_loam", "silt_loam"],
    waterNeed: "medium",
    rainfallMm: [500, 900],
    tempC: [20, 32],
    sowingMonths: [6, 7],
    note: "Fast-growing and flexible; responds well to timely nitrogen and drainage.",
  },
  {
    name: "Ragi (Finger millet)",
    emoji: "🌾",
    season: "kharif",
    durationDays: 105,
    ph: [5, 7.5],
    textures: ["sandy_loam", "loam", "clay_loam", "silt_loam"],
    waterNeed: "low",
    rainfallMm: [450, 900],
    tempC: [20, 31],
    sowingMonths: [6, 7],
    note: "The safest rain-fed millet for Kalahandi: tolerates dry spells and poorer soils.",
  },
  {
    name: "Cotton",
    emoji: "🌱",
    season: "kharif",
    durationDays: 165,
    ph: [6, 8],
    textures: ["clay_loam", "clay", "sandy_loam"],
    waterNeed: "medium",
    rainfallMm: [600, 1000],
    tempC: [21, 35],
    sowingMonths: [6, 7],
    note: "Needs well-drained black or clay-loam soil and steady pest scouting.",
  },
  {
    name: "Groundnut",
    emoji: "🥜",
    season: "kharif",
    durationDays: 110,
    ph: [6, 7.5],
    textures: ["sandy", "loamy_sand", "sandy_loam"],
    waterNeed: "low",
    rainfallMm: [500, 1000],
    tempC: [20, 33],
    sowingMonths: [6, 7],
    note: "Light, loose soil lets pegs enter easily. Avoid heavy clay and waterlogging.",
  },
  {
    name: "Pigeon pea (Arhar)",
    emoji: "🫘",
    season: "kharif",
    durationDays: 160,
    ph: [6, 7.5],
    textures: ["sandy_loam", "loam", "clay_loam"],
    waterNeed: "low",
    rainfallMm: [500, 850],
    tempC: [20, 35],
    sowingMonths: [6, 7],
    note: "Deep-rooted pulse that fixes nitrogen; a good rotation after a cereal.",
  },
  {
    name: "Green gram (Moong)",
    emoji: "🫘",
    season: "kharif",
    durationDays: 70,
    ph: [6, 7.5],
    textures: ["sandy_loam", "loam"],
    waterNeed: "low",
    rainfallMm: [350, 700],
    tempC: [20, 35],
    sowingMonths: [3, 4, 6, 7],
    note: "A short catch crop for the gap between main crops; improves soil nitrogen.",
  },
  {
    name: "Black gram (Biri)",
    emoji: "🫘",
    season: "kharif",
    durationDays: 80,
    ph: [6, 7.5],
    textures: ["loam", "clay_loam", "silt_loam"],
    waterNeed: "low",
    rainfallMm: [400, 800],
    tempC: [25, 35],
    sowingMonths: [6, 7],
    note: "Suits heavier soils than moong but is sensitive to waterlogging.",
  },
  {
    name: "Chickpea (Chana)",
    emoji: "🫘",
    season: "rabi",
    durationDays: 110,
    ph: [6, 8],
    textures: ["sandy_loam", "loam", "clay_loam"],
    waterNeed: "low",
    rainfallMm: [300, 600],
    tempC: [15, 30],
    sowingMonths: [10, 11],
    note: "Rabi pulse that uses residual moisture; avoid poorly drained patches.",
  },
  {
    name: "Wheat",
    emoji: "🌾",
    season: "rabi",
    durationDays: 120,
    ph: [6, 7.5],
    textures: ["loam", "clay_loam", "silt_loam"],
    waterNeed: "medium",
    rainfallMm: [400, 800],
    tempC: [10, 26],
    sowingMonths: [11, 12],
    note: "Needs cool ripening weather and 4–5 assured irrigations.",
  },
  {
    name: "Mustard",
    emoji: "🌼",
    season: "rabi",
    durationDays: 110,
    ph: [6, 7.5],
    textures: ["sandy_loam", "loam"],
    waterNeed: "low",
    rainfallMm: [300, 500],
    tempC: [10, 25],
    sowingMonths: [10, 11],
    note: "Low-water rabi oilseed; good on lighter soils with one or two irrigations.",
  },
  {
    name: "Sesame (Til)",
    emoji: "🌱",
    season: "kharif",
    durationDays: 90,
    ph: [5.5, 8],
    textures: ["sandy", "loamy_sand", "sandy_loam"],
    waterNeed: "low",
    rainfallMm: [400, 700],
    tempC: [25, 35],
    sowingMonths: [6, 7],
    note: "Tolerates light soil and heat, but not standing water.",
  },
  {
    name: "Sugarcane",
    emoji: "🎍",
    season: "perennial",
    durationDays: 365,
    ph: [6, 7.5],
    textures: ["loam", "clay_loam"],
    waterNeed: "high",
    rainfallMm: [1000, 1600],
    tempC: [20, 35],
    sowingMonths: [2, 3, 10],
    note: "Only with assured irrigation; it occupies the plot for a full year.",
  },
  {
    name: "Onion",
    emoji: "🧅",
    season: "rabi",
    durationDays: 120,
    ph: [6, 7],
    textures: ["sandy_loam", "loam"],
    waterNeed: "medium",
    rainfallMm: [400, 700],
    tempC: [15, 30],
    sowingMonths: [10, 11, 12],
    note: "Needs even moisture and well-drained soil for clean, storable bulbs.",
  },
  {
    name: "Tomato",
    emoji: "🍅",
    season: "rabi",
    durationDays: 110,
    ph: [6, 7],
    textures: ["sandy_loam", "loam"],
    waterNeed: "medium",
    rainfallMm: [500, 800],
    tempC: [18, 30],
    sowingMonths: [9, 10, 11],
    note: "High-value but disease-sensitive; mulch and stake to keep fruit off the soil.",
  },
  {
    name: "Brinjal",
    emoji: "🍆",
    season: "kharif",
    durationDays: 130,
    ph: [5.8, 7],
    textures: ["sandy_loam", "loam"],
    waterNeed: "medium",
    rainfallMm: [500, 850],
    tempC: [20, 32],
    sowingMonths: [6, 7, 9],
    note: "Hardy vegetable for small plots; scout for shoot and fruit borer.",
  },
  {
    name: "Chilli",
    emoji: "🌶️",
    season: "kharif",
    durationDays: 150,
    ph: [6, 7],
    textures: ["sandy_loam", "loam"],
    waterNeed: "medium",
    rainfallMm: [600, 1000],
    tempC: [20, 32],
    sowingMonths: [5, 6],
    note: "Good drainage is essential; avoid waterlogging during the monsoon.",
  },
  {
    name: "Okra (Bhendi)",
    emoji: "🌿",
    season: "kharif",
    durationDays: 90,
    ph: [6, 7],
    textures: ["sandy_loam", "loam"],
    waterNeed: "medium",
    rainfallMm: [500, 800],
    tempC: [20, 32],
    sowingMonths: [2, 3, 6, 7],
    note: "Fast cash crop; harvest every 2–3 days to keep pods tender.",
  },
  {
    name: "Potato",
    emoji: "🥔",
    season: "rabi",
    durationDays: 100,
    ph: [5.5, 6.5],
    textures: ["sandy_loam", "loam"],
    waterNeed: "medium",
    rainfallMm: [400, 700],
    tempC: [15, 25],
    sowingMonths: [10, 11],
    note: "Prefers slightly acidic, loose soil; tubers need cool nights.",
  },
  {
    name: "Cowpea",
    emoji: "🫘",
    season: "kharif",
    durationDays: 75,
    ph: [5.5, 7.5],
    textures: ["sandy_loam", "loam"],
    waterNeed: "low",
    rainfallMm: [400, 700],
    tempC: [20, 35],
    sowingMonths: [3, 4, 6, 7],
    note: "Quick pulse and fodder crop; fixes nitrogen for the next cereal.",
  },
  {
    name: "Field pea",
    emoji: "🫛",
    season: "rabi",
    durationDays: 100,
    ph: [6, 7.5],
    textures: ["loam", "clay_loam"],
    waterNeed: "low",
    rainfallMm: [400, 700],
    tempC: [10, 25],
    sowingMonths: [10, 11],
    note: "Cool-season pulse for residual moisture; avoid heavy clay.",
  },
  {
    name: "Little millet (Kutki)",
    emoji: "🌾",
    season: "kharif",
    durationDays: 90,
    ph: [5, 7.5],
    textures: ["sandy_loam", "loam"],
    waterNeed: "low",
    rainfallMm: [400, 800],
    tempC: [20, 32],
    sowingMonths: [6, 7],
    note: "Climate-resilient millet for uplands and uncertain rainfall.",
  },
];

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

/**
 * Simplified USDA texture triangle (sand / clay / silt percentages).
 * Returns one of the seven classes the crop catalogue uses.
 */
export function textureFromPercentages(
  sand: number,
  clay: number,
  silt?: number,
): SoilTexture {
  const s = clampPercent(sand);
  const c = clampPercent(clay);
  const si = clampPercent(
    silt ?? Math.max(0, 100 - s - c),
  );

  if (c >= 40 && si >= 40) return "clay";
  if (c >= 40) return "clay";
  if (c >= 35 && s >= 45) return "clay_loam";
  if (c >= 27 && s <= 45) return "clay_loam";
  if (c >= 20 && s >= 45) return "sandy_loam";
  if (c >= 27) return "clay_loam";
  if (s >= 85 && c < 10) return "sandy";
  if (s >= 70 && c < 15) return "loamy_sand";
  if (s >= 50) return "sandy_loam";
  if (si >= 50) return "silt_loam";
  return "loam";
}

export function textureFromSandClay(
  sand: number | null | undefined,
  clay: number | null | undefined,
): SoilTexture | null {
  if (sand === null || sand === undefined || clay === null || clay === undefined) {
    return null;
  }
  if (!Number.isFinite(sand) || !Number.isFinite(clay)) return null;
  return textureFromPercentages(sand, clay);
}

function nutrientLevel(
  value: number | null,
  thresholds: [number, number],
): NutrientLevel {
  if (value === null || !Number.isFinite(value)) return "unknown";
  if (value < thresholds[0]) return "low";
  if (value < thresholds[1]) return "medium";
  return "high";
}

function nutrientNote(
  key: SoilRating["key"],
  level: NutrientLevel,
): string {
  if (level === "unknown") return "Enter the value from the soil card to refine the plan.";
  if (level === "low") {
    switch (key) {
      case "nitrogen":
        return "Split nitrogen and add organic matter; avoid one heavy dose.";
      case "phosphorus":
        return "Place phosphorus near the root zone at sowing.";
      case "potassium":
        return "Potassium is low — include it in the basal dose.";
      case "organicCarbon":
        return "Add compost or green manure to build organic carbon.";
    }
  }
  if (level === "high") {
    switch (key) {
      case "nitrogen":
        return "Do not add more nitrogen than the crop guide requires.";
      case "phosphorus":
        return "Avoid extra phosphorus this season.";
      case "potassium":
        return "Potassium is adequate; skip a fresh potash dose.";
      case "organicCarbon":
        return "Organic carbon is healthy — keep recycling crop residue.";
    }
  }
  return "Adequate for most field crops; follow the crop-specific plan.";
}

export function analyseSoil(input: SoilTestInput | null | undefined): SoilAnalysis {
  const soil = input ?? {};
  const hasAnyValue = Object.values({
    ph: soil.ph,
    ec: soil.ec,
    organicCarbon: soil.organicCarbon,
    nitrogen: soil.nitrogen,
    phosphorus: soil.phosphorus,
    potassium: soil.potassium,
    sandPct: soil.sandPct,
    clayPct: soil.clayPct,
  }).some((value) => value !== null && value !== undefined && Number.isFinite(Number(value)));

  const texture =
    soil.texture ??
    textureFromSandClay(soil.sandPct ?? null, soil.clayPct ?? null);

  const ph = soil.ph ?? null;
  const ec = soil.ec ?? null;
  const organicCarbon = soil.organicCarbon ?? null;

  const phStatus: SoilAnalysis["phStatus"] =
    ph === null
      ? "unknown"
      : ph < 5.5
        ? "strongly acidic"
        : ph < 6.5
          ? "acidic"
          : ph <= 7.5
            ? "neutral"
            : ph <= 8.5
              ? "alkaline"
              : "strongly alkaline";

  const ecStatus: SoilAnalysis["ecStatus"] =
    ec === null
      ? "unknown"
      : ec < 1
        ? "normal"
        : ec <= 2
          ? "slightly saline"
          : "saline";

  const ratings: SoilRating[] = [
    {
      key: "nitrogen",
      label: "Available nitrogen",
      value: soil.nitrogen ?? null,
      unit: "kg/ha",
      level: nutrientLevel(soil.nitrogen ?? null, [280, 560]),
      note: nutrientNote("nitrogen", nutrientLevel(soil.nitrogen ?? null, [280, 560])),
    },
    {
      key: "phosphorus",
      label: "Available phosphorus (P₂O₅)",
      value: soil.phosphorus ?? null,
      unit: "kg/ha",
      level: nutrientLevel(soil.phosphorus ?? null, [10, 25]),
      note: nutrientNote("phosphorus", nutrientLevel(soil.phosphorus ?? null, [10, 25])),
    },
    {
      key: "potassium",
      label: "Available potassium (K₂O)",
      value: soil.potassium ?? null,
      unit: "kg/ha",
      level: nutrientLevel(soil.potassium ?? null, [120, 280]),
      note: nutrientNote("potassium", nutrientLevel(soil.potassium ?? null, [120, 280])),
    },
    {
      key: "organicCarbon",
      label: "Organic carbon",
      value: organicCarbon,
      unit: "%",
      level: nutrientLevel(organicCarbon, [0.5, 0.75]),
      note: nutrientNote("organicCarbon", nutrientLevel(organicCarbon, [0.5, 0.75])),
    },
  ];

  const issues: SoilIssue[] = [];

  if (phStatus === "strongly acidic" || phStatus === "acidic") {
    issues.push({
      key: "ph-low",
      severity: phStatus === "strongly acidic" ? "warning" : "info",
      title:
        phStatus === "strongly acidic"
          ? "Strongly acidic soil"
          : "Slightly acidic soil",
      detail: `pH ${ph?.toFixed(1)} limits nutrient availability. Most cereals prefer 6.0–7.5.`,
      action:
        "Spread agricultural lime before the next crop and mix it into the topsoil. Confirm the quantity with your KVK.",
    });
  } else if (phStatus === "strongly alkaline") {
    issues.push({
      key: "ph-high",
      severity: "warning",
      title: "Alkaline soil",
      detail: `pH ${ph?.toFixed(1)} can lock up phosphorus, zinc and iron.`,
      action:
        "Add organic matter and gypsum where recommended, and prefer tolerant crops until pH improves.",
    });
  } else if (phStatus === "alkaline") {
    issues.push({
      key: "ph-high",
      severity: "info",
      title: "Mildly alkaline soil",
      detail: `pH ${ph?.toFixed(1)} is above neutral but still workable.`,
      action: "Keep adding compost and avoid over-liming.",
    });
  }

  if (ecStatus !== "normal" && ecStatus !== "unknown") {
    issues.push({
      key: "salinity",
      severity: "warning",
      title:
        ecStatus === "saline" ? "Saline soil risk" : "Slight salinity",
      detail: `EC ${ec?.toFixed(2)} dS/m. Salts can reduce germination and root growth.`,
      action:
        "Improve drainage, apply gypsum only after a soil test, and avoid adding more chloride-heavy fertiliser.",
    });
  }

  const ocRating = ratings.find((rating) => rating.key === "organicCarbon");
  if (ocRating && ocRating.level === "low") {
    issues.push({
      key: "organic-carbon",
      severity: "warning",
      title: "Low organic carbon",
      detail: `Organic carbon is ${organicCarbon?.toFixed(2)}%. It should be above 0.5% for a healthy field.`,
      action:
        "Add 2–3 tonnes of well-rotted compost per acre where available, keep crop residue and consider a green-manure crop.",
    });
  }

  const lowNutrients = ratings.filter(
    (rating) => rating.level === "low" && rating.key !== "organicCarbon",
  );
  if (lowNutrients.length > 0) {
    issues.push({
      key: "nutrients",
      severity: "info",
      title: `Low ${lowNutrients.map((rating) => rating.label.split(" ")[1] ?? rating.label).join(", ")}`,
      detail: "A split application matched to the crop stage is more efficient than one heavy basal dose.",
      action:
        "Use the crop plan's fertiliser timing and confirm the exact dose with your soil card recommendation.",
    });
  }

  const knownRatings = ratings.filter((rating) => rating.level !== "unknown");
  const nutrientScore =
    knownRatings.length === 0
      ? 0
      : knownRatings.reduce(
          (sum, rating) =>
            sum +
            (rating.level === "high" ? 10 : rating.level === "medium" ? 7 : 3),
          0,
        ) / knownRatings.length;

  let score = 30;
  if (ph !== null) score += phStatus === "neutral" ? 18 : phStatus === "acidic" || phStatus === "alkaline" ? 8 : 2;
  if (texture !== null) score += 12;
  if (ec !== null) score += ecStatus === "normal" ? 8 : ecStatus === "slightly saline" ? 3 : 0;
  score += nutrientScore * 2;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const summary = !hasAnyValue
    ? "No soil test saved yet. Crop fit is based on rainfall and temperature only — add your Soil Health Card values for a sharper answer."
    : `pH ${ph !== null ? ph.toFixed(1) : "not entered"} · ${texture ? SOIL_TEXTURE_META[texture].label : "texture not entered"} · ${issues.length === 0 ? "no major limitation found" : `${issues.length} issue${issues.length === 1 ? "" : "s"} to manage`}.`;

  return {
    source: hasAnyValue ? "soil-health-card" : "missing",
    texture,
    textureLabel: texture ? SOIL_TEXTURE_META[texture].label : null,
    sandPct: soil.sandPct ?? null,
    clayPct: soil.clayPct ?? null,
    siltPct: soil.siltPct ?? null,
    ph,
    ec,
    organicCarbon,
    nitrogen: soil.nitrogen ?? null,
    phosphorus: soil.phosphorus ?? null,
    potassium: soil.potassium ?? null,
    ratings,
    phStatus,
    ecStatus,
    issues,
    score,
    summary,
    testedAt: soil.testedAt ?? null,
  };
}

export type FitRating = "best" | "good" | "possible" | "poor";

export interface CropSuitability {
  crop: CropRequirement;
  /** 0–100 suitability score. */
  score: number;
  rating: FitRating;
  reasons: string[];
  cautions: string[];
  sowingWindow: string;
  durationDays: number;
  waterNeed: WaterNeed;
  /** What is holding the score back, in the farmer's words. */
  limitingFactors: string[];
}

export interface CropFitInput {
  soil: SoilAnalysis;
  climate: ClimateSummary | null;
  /** 1–12; defaults to the current month. */
  month?: number;
  limit?: number;
  /** Crops the farmer already grows, shown first when suitable. */
  currentCrops?: string[];
}

const ADJACENT_TEXTURE: Record<SoilTexture, SoilTexture[]> = {
  sandy: ["loamy_sand", "sandy_loam"],
  loamy_sand: ["sandy", "sandy_loam"],
  sandy_loam: ["loamy_sand", "loam", "clay_loam"],
  loam: ["sandy_loam", "silt_loam", "clay_loam"],
  silt_loam: ["loam", "clay_loam"],
  clay_loam: ["loam", "silt_loam", "clay", "sandy_loam"],
  clay: ["clay_loam"],
};

export function describeMonths(months: number[]): string {
  if (months.length === 0) return "Check locally";
  const unique = [...new Set(months)].sort((a, b) => a - b);
  return unique.map((month) => MONTHS_SHORT[month - 1]).join(", ");
}

export function monthName(month: number): string {
  return MONTHS_LONG[(month - 1 + 12) % 12] ?? "";
}

function waterFit(
  need: WaterNeed,
  rainfall: number | null,
): { points: number; reason: string | null; caution: string | null } {
  if (rainfall === null) {
    return { points: 9, reason: null, caution: null };
  }
  const required =
    need === "high" ? 900 : need === "medium" ? 600 : 400;
  if (rainfall >= required) {
    return {
      points: 20,
      reason: `${Math.round(rainfall)} mm annual rainfall covers its ${need} water need`,
      caution: null,
    };
  }
  if (rainfall >= required * 0.75) {
    return {
      points: 13,
      reason: null,
      caution:
        need === "high"
          ? "Rainfall is marginal — plan assured irrigation"
          : "Rainfall is marginal; one or two supplemental irrigations may be needed",
    };
  }
  return {
    points: 4,
    reason: null,
    caution: `Rainfall (~${Math.round(rainfall)} mm) is below its ${need} water need`,
  };
}

function tempFit(
  range: [number, number],
  meanTemp: number | null,
  maxMonthly: number | null,
): { points: number; reason: string | null; caution: string | null; limiting: string | null } {
  if (meanTemp === null) return { points: 8, reason: null, caution: null, limiting: null };
  if (meanTemp >= range[0] && meanTemp <= range[1]) {
    if (maxMonthly !== null && maxMonthly > range[1] + 5) {
      return {
        points: 10,
        reason: `Mean temperature ${meanTemp.toFixed(1)}°C suits it`,
        caution: `Very hot months (${maxMonthly.toFixed(0)}°C) may stress it`,
        limiting: null,
      };
    }
    return {
      points: 15,
      reason: `Mean temperature ${meanTemp.toFixed(1)}°C is in its range`,
      caution: null,
      limiting: null,
    };
  }
  const distance = meanTemp < range[0] ? range[0] - meanTemp : meanTemp - range[1];
  if (distance <= 3) {
    return {
      points: 8,
      reason: null,
      caution: `Mean temperature is ${distance.toFixed(1)}°C outside its ideal range`,
      limiting: "temperature is marginal",
    };
  }
  return {
    points: 1,
    reason: null,
    caution: `Mean temperature ${meanTemp.toFixed(1)}°C is outside its comfortable range`,
    limiting: "temperature is outside the crop's range",
  };
}

/**
 * Ranks crops for the field. When a soil value is missing the matching factor
 * contributes a neutral score instead of assuming a value.
 */
export function recommendCrops(input: CropFitInput): CropSuitability[] {
  const { soil, climate } = input;
  const month = input.month ?? new Date().getMonth() + 1;
  const rainfall = climate?.annualRainfallMm ?? null;
  const meanTemp = climate?.meanTempC ?? null;
  const maxMonthly = climate?.maxMonthlyTempC ?? null;
  const currentCrops = (input.currentCrops ?? []).map((name) => name.toLowerCase());

  const scored = CROP_REQUIREMENTS.map((crop) => {
    let score = 0;
    const reasons: string[] = [];
    const cautions: string[] = [];
    const limiting: string[] = [];

    // pH — 25 points.
    if (soil.ph === null) {
      score += 12;
    } else if (soil.ph >= crop.ph[0] && soil.ph <= crop.ph[1]) {
      score += 25;
      reasons.push(`pH ${soil.ph.toFixed(1)} is in its ${crop.ph[0]}–${crop.ph[1]} range`);
    } else {
      const distance =
        soil.ph < crop.ph[0] ? crop.ph[0] - soil.ph : soil.ph - crop.ph[1];
      if (distance <= 0.4) {
        score += 14;
        cautions.push("Soil pH is at the edge of its range");
        limiting.push("pH is marginal");
      } else {
        score += 2;
        cautions.push(`pH ${soil.ph.toFixed(1)} is outside its ${crop.ph[0]}–${crop.ph[1]} range`);
        limiting.push("pH does not match");
      }
    }

    // Texture — 22 points.
    if (!soil.texture) {
      score += 11;
    } else if (crop.textures.includes(soil.texture)) {
      score += 22;
      reasons.push(`${SOIL_TEXTURE_META[soil.texture].label} soil suits it`);
    } else if (ADJACENT_TEXTURE[soil.texture].some((entry) => crop.textures.includes(entry))) {
      score += 13;
      cautions.push(`${SOIL_TEXTURE_META[soil.texture].label} is workable but not ideal`);
      limiting.push("soil texture is marginal");
    } else {
      score += 3;
      cautions.push(`${SOIL_TEXTURE_META[soil.texture].label} soil is a poor texture match`);
      limiting.push("texture is a poor match");
    }

    // Water — 20 points.
    const water = waterFit(crop.waterNeed, rainfall);
    score += water.points;
    if (water.reason) reasons.push(water.reason);
    if (water.caution) {
      cautions.push(water.caution);
      limiting.push("water balance");
    }

    // Temperature — 15 points.
    const temperature = tempFit(crop.tempC, meanTemp, maxMonthly);
    score += temperature.points;
    if (temperature.reason) reasons.push(temperature.reason);
    if (temperature.caution) cautions.push(temperature.caution);

    // Soil organic carbon + nutrients — 10 points.
    if (soil.organicCarbon === null) {
      score += 4;
    } else if (soil.organicCarbon >= 0.75) {
      score += 6;
    } else if (soil.organicCarbon >= 0.5) {
      score += 5;
    } else if (soil.organicCarbon >= 0.3) {
      score += 3;
    } else {
      score += 1;
      cautions.push("Low organic carbon — add compost before sowing");
      limiting.push("low organic carbon");
    }

    const knownNutrients = soil.ratings.filter(
      (rating) => rating.key !== "organicCarbon" && rating.level !== "unknown",
    );
    if (knownNutrients.length === 0) {
      score += 2;
    } else {
      const low = knownNutrients.filter((rating) => rating.level === "low").length;
      score += low === 0 ? 4 : low === 1 ? 2 : 0;
      if (low >= 2) {
        cautions.push("Two or more nutrients are low — correct them before sowing");
        limiting.push("nutrient status");
      }
    }

    // Season — 8 points.
    if (crop.sowingMonths.includes(month)) {
      score += 8;
      reasons.push(`Sowing month (${describeMonths(crop.sowingMonths)}) is open now`);
    } else {
      const adjacent = crop.sowingMonths.some(
        (entry) => Math.abs(entry - month) === 1 || Math.abs(entry - month) === 11,
      );
      score += adjacent ? 4 : 0;
      if (!adjacent) {
        cautions.push(`Normal sowing is ${describeMonths(crop.sowingMonths)}`);
      }
    }

    // A crop already on the farm gets a small continuity bonus.
    if (currentCrops.some((name) => crop.name.toLowerCase().includes(name) || name.includes(crop.name.toLowerCase()))) {
      score += 2;
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    // Without measured soil values the pH/texture/nutrient factors are neutral
    // guesses, so the score is capped and labelled as a climate-only estimate.
    if (soil.source !== "soil-health-card") {
      score = Math.min(score, 68);
      cautions.push("No soil test yet — this is a climate-only estimate");
      limiting.push("soil test missing");
    }

    const rating: FitRating =
      score >= 76 ? "best" : score >= 62 ? "good" : score >= 46 ? "possible" : "poor";

    return {
      crop,
      score,
      rating,
      reasons: reasons.slice(0, 4),
      cautions: cautions.slice(0, 4),
      sowingWindow: describeMonths(crop.sowingMonths),
      durationDays: crop.durationDays,
      waterNeed: crop.waterNeed,
      limitingFactors: [...new Set(limiting)].slice(0, 3),
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 6);
}

export const FIT_RATING_META: Record<
  FitRating,
  { label: string; tone: "leaf" | "warn" | "danger" | "muted" }
> = {
  best: { label: "Best fit", tone: "leaf" },
  good: { label: "Good fit", tone: "leaf" },
  possible: { label: "Possible", tone: "warn" },
  poor: { label: "Poor fit", tone: "danger" },
};

/** Normalises whatever came back from the soil save form. */
export function normalizeSoilInput(value: unknown): SoilTestInput {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const number = (key: string, min: number, max: number): number | null => {
    const raw = record[key];
    if (raw === null || raw === undefined || raw === "") return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
    return Math.round(parsed * 100) / 100;
  };

  const textureValues = Object.keys(SOIL_TEXTURE_META) as SoilTexture[];
  const texture =
    typeof record.texture === "string" && textureValues.includes(record.texture as SoilTexture)
      ? (record.texture as SoilTexture)
      : null;

  return {
    ph: number("ph", 0, 14),
    ec: number("ec", 0, 20),
    organicCarbon: number("organicCarbon", 0, 10),
    nitrogen: number("nitrogen", 0, 2000),
    phosphorus: number("phosphorus", 0, 500),
    potassium: number("potassium", 0, 2000),
    sandPct: number("sandPct", 0, 100),
    clayPct: number("clayPct", 0, 100),
    siltPct: number("siltPct", 0, 100),
    texture,
    testedAt:
      typeof record.testedAt === "string" && record.testedAt.length <= 40
        ? record.testedAt
        : null,
  };
}
