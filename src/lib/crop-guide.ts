/**
 * Deterministic crop-day guide.
 *
 * Everything here is computed from two values the farmer supplies during
 * onboarding — the crop and the number of days since sowing — plus the crop's
 * expected duration. No invented weather or farm data is involved.
 */

export interface CropStage {
  name: string;
  /** Start of the stage, inclusive, measured in days after sowing. */
  fromDay: number;
  /** End of the stage, inclusive. The last stage runs to the crop duration. */
  toDay: number;
  focus: string;
  tasks: string[];
  watchFor: string[];
}

export interface CropPreset {
  name: string;
  emoji: string;
  /** Typical sowing-to-harvest duration for Indian smallholder conditions. */
  durationDays: number;
  stages: CropStage[];
}

export interface CropDayGuide {
  cropName: string;
  emoji: string;
  ageDays: number;
  durationDays: number;
  /** 0–100, clamped. */
  progress: number;
  stage: CropStage;
  isHarvestWindow: boolean;
  daysToHarvest: number;
  nextStage: CropStage | null;
}

const stage = (
  name: string,
  fromDay: number,
  toDay: number,
  focus: string,
  tasks: string[],
  watchFor: string[],
): CropStage => ({ name, fromDay, toDay, focus, tasks, watchFor });

const GENERIC_STAGES: CropStage[] = [
  stage(
    "Germination & establishment",
    0,
    15,
    "Get a full, even stand and protect the young seedlings.",
    [
      "Check for gaps and re-sow missing spots within the first week.",
      "Keep the topsoil moist but avoid standing water.",
      "Remove weeds around the seedlings so they are not shaded.",
    ],
    ["Damping-off in wet patches", "Cutworms and ants"],
  ),
  stage(
    "Vegetative growth",
    16,
    45,
    "Build leaf area and roots; this is the main feeding window.",
    [
      "Apply the first nitrogen top-dressing if it is due.",
      "Do one weeding pass and loosen the soil crust.",
      "Irrigate when the top 5 cm of soil feels dry.",
    ],
    ["Aphids and sucking pests", "Leaf spots after rain"],
  ),
  stage(
    "Flowering & fruiting",
    46,
    80,
    "Protect flowers and young fruit — yield is decided here.",
    [
      "Keep soil moisture steady; avoid dry-to-flooded swings.",
      "Scout flowers every 2–3 days for borers and thrips.",
      "Spray only in calm early-morning hours, never before rain.",
    ],
    ["Bollworm / fruit borer", "Thrips and whitefly", "Blossom drop in heat"],
  ),
  stage(
    "Maturity & harvest",
    81,
    10_000,
    "Finish cleanly and get the produce out at the right moisture.",
    [
      "Stop nitrogen and reduce irrigation as the crop matures.",
      "Check grain/fruit maturity every 2–3 days.",
      "Arrange labour, bags and drying space before harvest day.",
    ],
    ["Storage pests in harvested produce", "Untimely rain at harvest"],
  ),
];

export const CROP_PRESETS: CropPreset[] = [
  {
    name: "Paddy (Rice)",
    emoji: "🌾",
    durationDays: 120,
    stages: [
      stage(
        "Nursery & transplanting",
        0,
        21,
        "Raise healthy seedlings and transplant without root shock.",
        [
          "Keep the nursery shallow-flooded and weed-free.",
          "Transplant 2–3 seedlings per hill at the recommended spacing.",
          "Maintain 2–3 cm of water after transplanting.",
        ],
        ["Stem borer dead-hearts", "Snails in flooded patches"],
      ),
      stage(
        "Tillering",
        22,
        50,
        "Push tiller count with the first nitrogen dose.",
        [
          "Apply the first nitrogen split at active tillering.",
          "Keep the field flooded 2–5 cm and drain before weeding.",
          "Scout for yellowing and dead-hearts every few days.",
        ],
        ["Brown planthopper", "Stem borer", "Bacterial leaf blight"],
      ),
      stage(
        "Panicle initiation & flowering",
        51,
        90,
        "Protect the panicle — this decides grain filling.",
        [
          "Apply the second nitrogen split at panicle initiation.",
          "Do not let the field dry out during flowering.",
          "Avoid spraying insecticides during peak bee activity.",
        ],
        ["Brown planthopper hopperburn", "Neck blast", "Sheath blight"],
      ),
      stage(
        "Grain filling & harvest",
        91,
        10_000,
        "Let grains fill and dry down before harvest.",
        [
          "Drain the field 10–14 days before expected harvest.",
          "Check grain hardness; harvest when 80–85% is straw-coloured.",
          "Dry grain to safe moisture before storage.",
        ],
        ["Grain discolouration from late rain", "Rodents and birds"],
      ),
    ],
  },
  {
    name: "Wheat",
    emoji: "🌾",
    durationDays: 120,
    stages: [
      stage(
        "Germination & crown root",
        0,
        20,
        "Establish an even stand before winter.",
        [
          "Sow at the right depth and keep the seedbed moist.",
          "Do the first irrigation at crown-root initiation (about 20 days).",
          "Remove weeds early so they do not take over.",
        ],
        ["Termites", "Loose smut"],
      ),
      stage(
        "Tillering",
        21,
        45,
        "Build tillers and apply the first nitrogen split.",
        [
          "Apply the first nitrogen dose and irrigate lightly.",
          "Watch for yellowing that signals nitrogen shortage.",
          "Keep the field free of grassy weeds.",
        ],
        ["Aphids", "Yellow rust in cool humid weather"],
      ),
      stage(
        "Jointing, heading & flowering",
        46,
        85,
        "Protect the flag leaf and the ear.",
        [
          "Do not skip irrigation at heading and flowering.",
          "Scout the lower leaves for rust pustules.",
          "Avoid overhead irrigation during flowering.",
        ],
        ["Yellow rust", "Powdery mildew", "Aphid colonies on ears"],
      ),
      stage(
        "Grain filling & harvest",
        86,
        10_000,
        "Fill the grain and harvest at the right moisture.",
        [
          "Stop irrigation after the dough stage.",
          "Harvest when the straw turns golden and grains are hard.",
          "Dry to 12% moisture before storing.",
        ],
        ["Lodging after wind and rain", "Karnal bunt"],
      ),
    ],
  },
  {
    name: "Maize",
    emoji: "🌽",
    durationDays: 100,
    stages: [
      stage(
        "Emergence & establishment",
        0,
        18,
        "Get a uniform stand and keep early weeds down.",
        [
          "Check emergence and gap-fill within a week.",
          "Keep the root zone moist, not waterlogged.",
          "Do a first weeding and light earthing-up.",
        ],
        ["Fall armyworm", "Cutworm"],
      ),
      stage(
        "Vegetative & knee-high",
        19,
        45,
        "Feed the crop and scout every leaf whorl.",
        [
          "Apply the first nitrogen top-dressing at knee-high stage.",
          "Open the whorls and look for fall armyworm frass.",
          "Earth up the base to support the stems.",
        ],
        ["Fall armyworm", "Stem borer", "Leaf blight"],
      ),
      stage(
        "Tasselling & silking",
        46,
        70,
        "Protect pollination and keep moisture steady.",
        [
          "Irrigate at tasselling and silking — drought here cuts yield.",
          "Avoid insecticide sprays during pollination.",
          "Scout cobs for borer entry holes.",
        ],
        ["Fall armyworm in cobs", "Turcicum leaf blight"],
      ),
      stage(
        "Grain filling & harvest",
        71,
        10_000,
        "Finish grain fill and dry the cobs.",
        [
          "Stop irrigation as the husk starts to dry.",
          "Harvest when husks are dry and kernels dent firmly.",
          "Dry cobs on a clean mat before shelling.",
        ],
        ["Aflatoxin risk in damp storage", "Birds and rodents"],
      ),
    ],
  },
  {
    name: "Tomato",
    emoji: "🍅",
    durationDays: 110,
    stages: [
      stage(
        "Transplant & establishment",
        0,
        15,
        "Settle transplants and protect the roots.",
        [
          "Water lightly but daily for the first week.",
          "Provide stakes or trellis support early.",
          "Remove flowers for the first 2 weeks to build the plant.",
        ],
        ["Damping-off", "Cutworm"],
      ),
      stage(
        "Vegetative growth",
        16,
        35,
        "Build a strong frame with steady moisture.",
        [
          "Apply a balanced fertilizer and mulch the bed.",
          "Prune side shoots on indeterminate varieties.",
          "Irrigate at the base, not over the leaves.",
        ],
        ["Whitefly", "Early blight", "Leaf miner"],
      ),
      stage(
        "Flowering & fruit set",
        36,
        75,
        "Keep pollination and fruit development on track.",
        [
          "Maintain even moisture to prevent blossom-end rot.",
          "Scout for fruit borer entry holes every 2–3 days.",
          "Spray only in the evening when pollinators are away.",
        ],
        ["Fruit borer", "Whitefly-transmitted virus", "Blossom-end rot"],
      ),
      stage(
        "Harvest",
        76,
        10_000,
        "Pick on time and keep fruit quality high.",
        [
          "Harvest every 2–3 days at the right colour stage.",
          "Keep harvested fruit in shade and cool it quickly.",
          "Remove diseased plants to stop spread.",
        ],
        ["Fruit rot in wet weather", "Sunscald"],
      ),
    ],
  },
  {
    name: "Cotton",
    emoji: "🌱",
    durationDays: 165,
    stages: [
      stage(
        "Establishment",
        0,
        30,
        "Get a healthy stand and strong early roots.",
        [
          "Gap-fill and thin to the recommended plant spacing.",
          "Do the first weeding and light hoeing.",
          "Watch the growing point for early sucking pests.",
        ],
        ["Thrips", "Jassids", "Damping-off"],
      ),
      stage(
        "Squaring",
        31,
        70,
        "Set the fruit load and manage sucking pests.",
        [
          "Apply the first nitrogen dose at squaring.",
          "Scout for jassids, thrips and whitefly on the underside of leaves.",
          "Avoid excess nitrogen — it invites pests.",
        ],
        ["Jassids", "Thrips", "Whitefly"],
      ),
      stage(
        "Flowering & boll formation",
        71,
        130,
        "Protect bolls from bollworm and maintain moisture.",
        [
          "Inspect squares and young bolls for bollworm damage.",
          "Irrigate at flowering and boll development.",
          "Follow local resistance-management guidance for sprays.",
        ],
        ["Pink bollworm", "American bollworm", "Boll rot"],
      ),
      stage(
        "Boll opening & harvest",
        131,
        10_000,
        "Pick clean cotton without contamination.",
        [
          "Pick dry bolls in the morning, before the heat.",
          "Keep picked cotton covered and away from moisture.",
          "Do not mix stained or wet cotton with clean lint.",
        ],
        ["Stain from late rain", "Storage pests"],
      ),
    ],
  },
  {
    name: "Onion",
    emoji: "🧅",
    durationDays: 120,
    stages: [
      stage(
        "Nursery & transplant",
        0,
        21,
        "Raise sturdy seedlings and transplant carefully.",
        [
          "Keep the nursery moist and weed-free.",
          "Transplant at 10–12 cm height with trimmed roots.",
          "Irrigate immediately after transplanting.",
        ],
        ["Damping-off", "Thrips in the nursery"],
      ),
      stage(
        "Vegetative growth",
        22,
        55,
        "Build leaf area — leaves make the bulb.",
        [
          "Apply nitrogen and keep the bed evenly moist.",
          "Weed carefully so bulbs are not disturbed.",
          "Scout leaf whorls for thrips.",
        ],
        ["Thrips", "Purple blotch"],
      ),
      stage(
        "Bulb development",
        56,
        100,
        "Size the bulbs with steady water and feeding.",
        [
          "Keep moisture steady, then reduce it as bulbs mature.",
          "Stop nitrogen once bulbs start to size.",
          "Remove bolting plants promptly.",
        ],
        ["Bulb rot from overwatering", "Thrips"],
      ),
      stage(
        "Maturity & curing",
        101,
        10_000,
        "Cure properly so bulbs store well.",
        [
          "Stop irrigation when tops begin to fall.",
          "Lift bulbs and cure them in the shade for 2–3 weeks.",
          "Store in a dry, ventilated place.",
        ],
        ["Neck rot", "Sprouting in storage"],
      ),
    ],
  },
  {
    name: "Potato",
    emoji: "🥔",
    durationDays: 100,
    stages: [
      stage(
        "Emergence",
        0,
        20,
        "Get a full row and protect emerging shoots.",
        [
          "Keep the ridge moist but not soggy.",
          "Earth up as shoots emerge.",
          "Check for cutworm damage at the base.",
        ],
        ["Cutworm", "Black scurf"],
      ),
      stage(
        "Vegetative growth",
        21,
        45,
        "Build foliage and hill the rows.",
        [
          "Apply the first nitrogen dose and irrigate.",
          "Hill the soil so tubers are not exposed to light.",
          "Scout for aphids and early blight.",
        ],
        ["Aphids", "Early blight"],
      ),
      stage(
        "Tuber bulking",
        46,
        80,
        "Keep water steady for even tuber size.",
        [
          "Irrigate regularly during bulking.",
          "Watch for late blight after cool, humid nights.",
          "Avoid heavy nitrogen late in the season.",
        ],
        ["Late blight", "Aphid-transmitted virus"],
      ),
      stage(
        "Maturity & harvest",
        81,
        10_000,
        "Set skin and lift tubers without bruising.",
        [
          "Stop irrigation 10–14 days before harvest.",
          "Cut haulms to help skins set if recommended locally.",
          "Lift in dry weather and cure in shade.",
        ],
        ["Tuber rot in wet soil", "Greening from sunlight"],
      ),
    ],
  },
];

const PRESET_BY_NAME = new Map(CROP_PRESETS.map((preset) => [preset.name, preset]));

export const CROP_OPTIONS = CROP_PRESETS.map((preset) => preset.name);

export function getCropPreset(cropName: string): CropPreset {
  return (
    PRESET_BY_NAME.get(cropName) ?? {
      name: cropName,
      emoji: "🌱",
      durationDays: 120,
      stages: GENERIC_STAGES,
    }
  );
}

export function defaultDurationDays(cropName: string): number {
  return getCropPreset(cropName).durationDays;
}

function resolveDuration(cropName: string, durationDays?: number | null): number {
  if (durationDays && Number.isFinite(durationDays) && durationDays > 0) {
    return Math.round(durationDays);
  }
  return defaultDurationDays(cropName);
}

function scaledStages(preset: CropPreset, durationDays: number): CropStage[] {
  const presetDuration = preset.durationDays;
  const ratio = durationDays / presetDuration;

  return preset.stages.map((entry, index) => {
    const isLast = index === preset.stages.length - 1;
    return {
      ...entry,
      fromDay: Math.max(0, Math.round(entry.fromDay * ratio)),
      toDay: isLast ? durationDays : Math.max(entry.fromDay + 1, Math.round(entry.toDay * ratio)),
    };
  });
}

export function getCropDayGuide(
  cropName: string,
  ageDays: number,
  durationDays?: number | null,
): CropDayGuide {
  const preset = getCropPreset(cropName);
  const total = resolveDuration(cropName, durationDays);
  const age = Math.max(0, Math.round(ageDays || 0));
  const stages = scaledStages(preset, total);

  const currentIndex = Math.max(
    0,
    stages.findIndex((entry, index) => {
      const isLast = index === stages.length - 1;
      return age >= entry.fromDay && (isLast || age <= entry.toDay);
    }),
  );

  const current = stages[currentIndex] ?? stages[0];
  const next = stages[currentIndex + 1] ?? null;
  const progress = Math.min(100, Math.round((age / total) * 100));

  return {
    cropName,
    emoji: preset.emoji,
    ageDays: age,
    durationDays: total,
    progress,
    stage: current,
    isHarvestWindow: age >= total || currentIndex === stages.length - 1,
    daysToHarvest: Math.max(0, total - age),
    nextStage: next,
  };
}

/** Growth-stage label stored on the crop row when it is created/updated. */
export function stageNameForDay(
  cropName: string,
  ageDays: number,
  durationDays?: number | null,
): string {
  return getCropDayGuide(cropName, ageDays, durationDays).stage.name;
}

/** Converts a "days since sowing" answer into a real calendar date. */
export function sowingDateFromAge(ageDays: number, now = new Date()): Date {
  const days = Math.max(0, Math.round(ageDays));
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - days);
  return start;
}
