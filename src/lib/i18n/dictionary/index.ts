import { AUTH } from "./auth";
import { CAMERA } from "./camera";
import { COMMON } from "./common";
import { CROPS } from "./crops";
import { DASHBOARD } from "./dashboard";
import { DISEASE } from "./disease";
import { GUIDE_A } from "./guide-a";
import { GUIDE_B } from "./guide-b";
import { MAP } from "./map";
import { PEST } from "./pest";
import { SETUP } from "./setup";
import { TODAY } from "./today";
import { WATCH } from "./watch";

/** Odia dictionary, keyed by the exact English source string. */
export const ODIA: Record<string, string> = {
  ...COMMON,
  ...DASHBOARD,
  ...CROPS,
  ...DISEASE,
  ...AUTH,
  ...MAP,
  ...WATCH,
  ...CAMERA,
  ...GUIDE_A,
  ...GUIDE_B,
  ...PEST,
  ...SETUP,
  ...TODAY,
};

export { PATTERNS } from "./patterns";
export type { Translate, TranslationRule, Vars } from "./patterns";
