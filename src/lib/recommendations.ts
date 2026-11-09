/**
 * Curated Amazon.in product matches for the weekly action plan.
 *
 * Each entry points at a real Amazon.in product page and stores the product
 * photo locally under `public/products/amazon/` so the card cannot break if the
 * marketplace CDN rotates the image. Prices, sellers and availability are
 * always read on Amazon — we never hardcode them.
 *
 * The card shows our own advisory copy, not the marketplace title/description.
 * An affiliate tag is added only when the operator configures one.
 */

export type ShoppingCategory = "pesticide" | "fertilizer" | "equipment";

export interface ShoppingSuggestion {
  id: string;
  category: ShoppingCategory;
  title: string;
  detail: string;
  /** Local product photo (downloaded from the Amazon listing). */
  image: string;
  /** Plain search phrase, kept so the client can show it without parsing the URL. */
  query: string;
  /** Direct Amazon.in product page (or a search fallback). */
  url: string;
}

type PestPressureLevel = "low" | "moderate" | "high" | "critical";

interface ShoppingInput {
  cropName: string;
  /** The generated weekly action plan (markdown). */
  advisory: string;
  pestLevel?: PestPressureLevel | null;
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

/** Amazon.in search URL used only when a direct listing is unavailable. */
export function amazonSearchUrl(query: string): string {
  const params = new URLSearchParams({ k: query });
  const tag = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG?.trim();
  if (tag) params.set("tag", tag);
  return `https://www.amazon.in/s?${params.toString()}`;
}

function amazonProductUrl(asin: string): string {
  return withAffiliateTag(`https://www.amazon.in/dp/${asin}`);
}

/**
 * Builds 2–4 suggestions for the week.
 *
 * - Pesticide / disease pressure → softer first options plus monitoring traps.
 * - Fertilizer mentioned in the plan → compost and a balanced fertilizer.
 * - Neither → field equipment (plough, weeder, sprayer, drip kit).
 */
export function getWeeklyShoppingList(input: ShoppingInput): ShoppingSuggestion[] {
  const { cropName, advisory, pestLevel } = input;
  const body = advisory.replace(/^#{1,6}\s+.*$/gm, "");

  const pestPressure =
    pestLevel === "high" ||
    pestLevel === "critical" ||
    ((pestLevel === "moderate" || pestLevel == null) &&
      (DISEASE_WORDS.test(body) || PEST_WORDS.test(body)));
  const needsFertilizer = FERTILIZER_WORDS.test(body);

  const crop = cropName.trim() || "the crop";
  const lowerCrop = crop.toLowerCase();

  const suggestions: ShoppingSuggestion[] = [];
  const add = (
    id: string,
    category: ShoppingCategory,
    title: string,
    detail: string,
    query: string,
    image: string,
    asin: string,
  ) => {
    suggestions.push({
      id,
      category,
      title,
      detail,
      query,
      image,
      url: amazonProductUrl(asin),
    });
  };

  if (pestPressure) {
    add(
      "bio-pesticide",
      "pesticide",
      "Neem oil or bio-pesticide",
      `A softer first option for ${lowerCrop} when pests first appear. Confirm the target pest and label dose first.`,
      `neem oil spray for ${crop}`,
      "/products/amazon/neem.jpg",
      "B09D3KLRJJ",
    );
    add(
      "monitoring-traps",
      "pesticide",
      "Yellow sticky traps",
      "Use traps to confirm whitefly, thrips or aphids before spending on a spray.",
      `yellow sticky trap for ${crop}`,
      "/products/amazon/traps.jpg",
      "B0DFPJFF5C",
    );
  }

  if (needsFertilizer) {
    add(
      "compost",
      "fertilizer",
      "Vermicompost / farmyard manure",
      `A steady organic base for ${lowerCrop}. Match the quantity to the field size and soil test.`,
      "vermicompost organic fertilizer",
      "/products/amazon/compost.jpg",
      "B0BDVN579S",
    );
    add(
      "npk",
      "fertilizer",
      "Balanced NPK fertilizer",
      "Choose the grade your soil test recommends. Split the dose instead of applying it all at once.",
      `npk fertilizer for ${crop}`,
      "/products/amazon/npk.jpg",
      "B0D969YM4L",
    );
  }

  if (!pestPressure && !needsFertilizer) {
    add(
      "plough",
      "equipment",
      "Plough / cultivator",
      "For land preparation and breaking a compacted top layer before the next sowing.",
      "tractor plough cultivator agriculture",
      "/products/amazon/plough.jpg",
      "B0GH8XZBX1",
    );
    add(
      "weeder",
      "equipment",
      "Hand weeder",
      "A cheap, low-effort way to keep the crop row clear between sprays.",
      "hand weeder agriculture",
      "/products/amazon/weeder.jpg",
      "B0BRL8SCVC",
    );
    add(
      "sprayer",
      "equipment",
      "Battery knapsack sprayer",
      "Useful for foliar feeds and bio-pesticides when a spray is actually needed.",
      "battery knapsack sprayer agriculture",
      "/products/amazon/sprayer.jpg",
      "B0FYNM6HHR",
    );
    add(
      "drip-kit",
      "equipment",
      "Drip irrigation kit",
      "Keeps moisture steady at the root zone and cuts water use on dry weeks.",
      "drip irrigation kit agriculture",
      "/products/amazon/drip-kit.jpg",
      "B0DN6LXHGY",
    );
  }

  return suggestions.slice(0, 4);
}

export const SHOPPING_CATEGORY_META: Record<
  ShoppingCategory,
  { label: string; tone: string }
> = {
  pesticide: { label: "Crop protection", tone: "chip-danger" },
  fertilizer: { label: "Nutrition", tone: "chip-warn" },
  equipment: { label: "Equipment", tone: "chip-lime" },
};
