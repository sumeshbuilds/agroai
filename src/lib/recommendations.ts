/**
 * Curated Amazon.in suggestions for the field plan.
 *
 * Direct product pages are used only for the small set of listings whose ASIN
 * is stored here intentionally; everything else is an Amazon.in **search**
 * link and is labelled as such in the UI. Prices, sellers and availability are
 * always read on Amazon — they are never hardcoded. An affiliate tag is added
 * only when the operator configures one.
 */

export type ShoppingCategory =
  | "pesticide"
  | "fertilizer"
  | "equipment"
  | "seed"
  | "soil"
  | "water"
  | "safety";

export interface ShoppingSuggestion {
  id: string;
  category: ShoppingCategory;
  title: string;
  detail: string;
  /** Local product photo, or null when only a search link exists. */
  image: string | null;
  /** Plain search phrase, kept so the client can show it without parsing the URL. */
  query: string;
  /** Direct Amazon.in product page, or a labelled search link. */
  url: string;
  /** True only for a reviewed direct listing stored in this file. */
  verified: boolean;
  /** Why this item appeared in the list. */
  reason: string;
  /** Lower sorts first. */
  priority: number;
}

type PestPressureLevel = "low" | "moderate" | "high" | "critical";
type DiseasePressureLevel = "low" | "moderate" | "high";

interface ShoppingInput {
  cropName: string;
  /** The generated weekly action plan (markdown). */
  advisory: string;
  pestLevel?: PestPressureLevel | null;
  /** Categories present in today's checklist. */
  taskCategories?: string[];
  diseasePressure?: DiseasePressureLevel | null;
  /** 7-day ET0 minus rain, mm. */
  irrigationDeficitMm?: number | null;
  heatMaxC?: number | null;
  soilIssues?: string[];
  soilPh?: number | null;
  /** Limit; defaults to 4 for the weekly card, 6 for the field checklist. */
  limit?: number;
}

const DISEASE_WORDS =
  /(blight|rust|mildew|leaf spot|rot\b|wilt|anthracnose|smut|blast|damping.?off)/i;
const PEST_WORDS =
  /(aphid|thrip|whitefly|mite|borer|armyworm|bollworm|planthopper|jassid|cutworm|mealybug|fruit fly|nematode|termite|locust|bug\b)/i;
const FERTILIZER_WORDS =
  /(fertilis|fertiliz|nitrogen|urea|\bdap\b|\bnpk\b|potash|compost|manure|top.?dress|nutrient|vermicompost|mulch)/i;

function withAffiliateTag(url: string): string {
  const tag = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG?.trim();
  if (!tag) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("tag", tag);
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Amazon.in search URL used when no reviewed direct listing is available. */
export function amazonSearchUrl(query: string): string {
  const params = new URLSearchParams({ k: query });
  const tag = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG?.trim();
  if (tag) params.set("tag", tag);
  return `https://www.amazon.in/s?${params.toString()}`;
}

function amazonProductUrl(asin: string): string {
  return withAffiliateTag(`https://www.amazon.in/dp/${asin}`);
}

interface AddInput {
  id: string;
  category: ShoppingCategory;
  title: string;
  detail: string;
  query: string;
  priority: number;
  reason: string;
  image?: string | null;
  asin?: string;
}

/**
 * Builds a goal-directed, de-duplicated list:
 *  1. Safety and active crop-protection needs
 *  2. Soil correction and nutrition
 *  3. Water / heat mitigation
 *  4. Equipment for the work that is actually due
 */
export function getFieldShoppingList(input: ShoppingInput): ShoppingSuggestion[] {
  const {
    cropName,
    advisory,
    pestLevel,
    taskCategories = [],
    diseasePressure,
    irrigationDeficitMm,
    heatMaxC,
    soilIssues = [],
    soilPh,
  } = input;

  const body = advisory.replace(/^#{1,6}\s+.*$/gm, "");
  const categories = new Set(taskCategories);
  const lowerCrop = (cropName.trim() || "the crop").toLowerCase();
  const phValue =
    typeof soilPh === "number" && Number.isFinite(soilPh) ? soilPh : null;

  const pestPressure =
    pestLevel === "high" ||
    pestLevel === "critical" ||
    diseasePressure === "high" ||
    ((pestLevel === "moderate" || pestLevel == null) &&
      (DISEASE_WORDS.test(body) || PEST_WORDS.test(body))) ||
    categories.has("pest");
  const needsFertilizer =
    FERTILIZER_WORDS.test(body) ||
    categories.has("nutrition") ||
    soilIssues.some((issue) => /nutrient|nitrogen|phosphor|potassium|carbon/i.test(issue));
  const needsWater =
    categories.has("water") ||
    (irrigationDeficitMm ?? 0) >= 12 ||
    /dry|irrigat|moisture/i.test(body);
  const needsHeatCare =
    (heatMaxC ?? 0) >= 36 || categories.has("water");
  const needsSoilFix =
    categories.has("soil") ||
    soilIssues.some((issue) => /ph|salin|gypsum|lime|acid/i.test(issue));

  const suggestions: ShoppingSuggestion[] = [];
  const seen = new Set<string>();

  const add = (entry: AddInput) => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    suggestions.push({
      id: entry.id,
      category: entry.category,
      title: entry.title,
      detail: entry.detail,
      query: entry.query,
      image: entry.image ?? null,
      url: entry.asin ? amazonProductUrl(entry.asin) : amazonSearchUrl(entry.query),
      verified: Boolean(entry.asin),
      reason: entry.reason,
      priority: entry.priority,
    });
  };

  if (pestPressure) {
    add({
      id: "monitoring-traps",
      category: "pesticide",
      title: "Yellow sticky traps",
      detail: "Confirm whitefly, thrips or aphids before spending on a spray.",
      query: `yellow sticky trap for ${cropName}`,
      image: "/products/amazon/traps.jpg",
      asin: "B0DFPJFF5C",
      priority: 1,
      reason: "Pest or disease pressure is elevated — confirm the insect first.",
    });
    add({
      id: "bio-pesticide",
      category: "pesticide",
      title: "Neem oil or bio-pesticide",
      detail: `A softer first option for ${lowerCrop} when pests first appear. Confirm the target pest and label dose first.`,
      query: `neem oil spray for ${cropName}`,
      image: "/products/amazon/neem.jpg",
      asin: "B09D3KLRJJ",
      priority: 2,
      reason: "A lower-risk option before a chemical spray is considered.",
    });
    add({
      id: "safety-kit",
      category: "safety",
      title: "Spray safety kit (mask, gloves, goggles)",
      detail:
        "Wear these whenever a label-approved spray is applied, and never spray against the wind.",
      query: "agricultural spray safety mask gloves goggles",
      priority: 3,
      reason: "Spraying is on the plan — protect the person applying it.",
    });
  }

  if (needsSoilFix && phValue !== null && phValue < 6) {
    add({
      id: "agricultural-lime",
      category: "soil",
      title: "Agricultural lime",
      detail:
        "Raises pH on acidic soil. Confirm the quantity from your soil test before spreading.",
      query: "agricultural lime soil ph",
      image: "/products/amazon/compost.jpg",
      priority: 2,
      reason: `Soil test shows acidic pH ${phValue.toFixed(1)}.`,
    });
  }
  if (needsSoilFix && phValue !== null && phValue > 8) {
    add({
      id: "gypsum",
      category: "soil",
      title: "Agricultural gypsum",
      detail:
        "Used for alkaline or sodic soil after a soil test. Do not apply it blindly.",
      query: "agricultural gypsum soil",
      image: "/products/amazon/compost.jpg",
      priority: 2,
      reason: `Soil test shows alkaline pH ${phValue.toFixed(1)}.`,
    });
  }

  if (needsFertilizer) {
    add({
      id: "compost",
      category: "fertilizer",
      title: "Vermicompost / farmyard manure",
      detail: `A steady organic base for ${lowerCrop}. Match the quantity to the field size and soil test.`,
      query: "vermicompost organic fertilizer",
      image: "/products/amazon/compost.jpg",
      asin: "B0BDVN579S",
      priority: 4,
      reason: "Builds organic carbon and feeds the soil steadily.",
    });
    add({
      id: "npk",
      category: "fertilizer",
      title: "Balanced NPK fertilizer",
      detail: "Choose the grade your soil test recommends. Split the dose instead of applying it all at once.",
      query: `npk fertilizer for ${cropName}`,
      image: "/products/amazon/npk.jpg",
      asin: "B0D969YM4L",
      priority: 5,
      reason: "Nutrient demand is on the plan — match the grade to the soil test.",
    });
  }

  if (needsWater) {
    add({
      id: "drip-kit",
      category: "water",
      title: "Drip irrigation kit",
      detail:
        "Keeps the root zone steady and cuts water use on dry weeks. Size it to your plot.",
      query: "drip irrigation kit agriculture",
      image: "/products/amazon/drip-kit.jpg",
      asin: "B0DN6LXHGY",
      priority: 3,
      reason:
        (irrigationDeficitMm ?? 0) >= 12
          ? `The 7-day moisture deficit is about ${Math.round(irrigationDeficitMm ?? 0)} mm.`
          : "Water management is on today's list.",
    });
  }

  if (needsHeatCare && (heatMaxC ?? 0) >= 36) {
    add({
      id: "shade-net",
      category: "equipment",
      title: "Shade net (50%)",
      detail:
        "Cuts midday heat on vegetables and nurseries. Remove it during cloudy spells.",
      query: "50 percent shade net agriculture",
      priority: 4,
      reason: `Afternoon heat reaches about ${Math.round(heatMaxC ?? 0)}°C.`,
    });
  }

  if (!pestPressure && !needsFertilizer && !needsWater) {
    add({
      id: "plough",
      category: "equipment",
      title: "Plough / cultivator",
      detail: "For land preparation and breaking a compacted top layer before the next sowing.",
      query: "tractor plough cultivator agriculture",
      image: "/products/amazon/plough.jpg",
      asin: "B0GH8XZBX1",
      priority: 5,
      reason: "No urgent input need — prepare the next block.",
    });
    add({
      id: "weeder",
      category: "equipment",
      title: "Hand weeder",
      detail: "A cheap, low-effort way to keep the crop row clear between sprays.",
      query: "hand weeder agriculture",
      image: "/products/amazon/weeder.jpg",
      asin: "B0BRL8SCVC",
      priority: 6,
      reason: "Routine weeding keeps the crop competitive.",
    });
    add({
      id: "sprayer",
      category: "equipment",
      title: "Battery knapsack sprayer",
      detail: "Useful for foliar feeds and bio-pesticides when a spray is actually needed.",
      query: "battery knapsack sprayer agriculture",
      image: "/products/amazon/sprayer.jpg",
      asin: "B0FYNM6HHR",
      priority: 7,
      reason: "An even spray is safer and uses less product.",
    });
  }

  if (categories.has("field") || categories.has("harvest")) {
    add({
      id: "harvest-bags",
      category: "equipment",
      title: "Clean harvest bags and tarpaulin",
      detail:
        "Keeps produce off the soil and dry during harvest. Avoid coloured or used chemical bags.",
      query: "agricultural harvest bags tarpaulin",
      priority: 6,
      reason: "Harvest handling is on today's list.",
    });
  }

  return suggestions
    .sort((a, b) => a.priority - b.priority)
    .slice(0, input.limit ?? 4);
}

/**
 * Backwards-compatible wrapper used by the weekly report card.
 */
export function getWeeklyShoppingList(input: {
  cropName: string;
  advisory: string;
  pestLevel?: PestPressureLevel | null;
}): ShoppingSuggestion[] {
  return getFieldShoppingList({ ...input, limit: 4 });
}

export const SHOPPING_CATEGORY_META: Record<
  ShoppingCategory,
  { label: string; tone: string }
> = {
  pesticide: { label: "Crop protection", tone: "chip-danger" },
  fertilizer: { label: "Nutrition", tone: "chip-warn" },
  equipment: { label: "Equipment", tone: "chip-lime" },
  seed: { label: "Seed", tone: "chip-brand" },
  soil: { label: "Soil care", tone: "chip-warn" },
  water: { label: "Water", tone: "chip-info" },
  safety: { label: "Safety", tone: "chip-danger" },
};
