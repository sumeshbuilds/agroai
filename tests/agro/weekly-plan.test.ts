import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePlanSections, plainLines, sectionMeta } from "../../src/lib/weekly-plan";

const PLAN = [
  "## Irrigation",
  "Skip watering on Thursday if rain arrives.",
  "",
  "## Fertilizer & Spraying",
  "Apply on Sunday when winds are lowest.",
  "",
  "## Pest & Disease Watch",
  "Scout for stem borer every 2-3 days.",
  "",
  "## Best Field-Work Days",
  "7 of 7 days are workable.",
  "",
  "## Next Step",
  "Keep the nursery shallow-flooded.",
].join("\n");

test("weekly plan: five sections parse in order", () => {
  const sections = parsePlanSections(PLAN);
  assert.equal(sections.length, 5);
  assert.deepEqual(
    sections.map((section) => section.heading),
    [
      "Irrigation",
      "Fertilizer & Spraying",
      "Pest & Disease Watch",
      "Best Field-Work Days",
      "Next Step",
    ],
  );
  assert.match(sections[0].body, /Skip watering/);
  assert.match(sections[4].body, /nursery/);
});

test("weekly plan: untitled text stays one card", () => {
  const sections = parsePlanSections("Just one paragraph of advice.");
  assert.equal(sections.length, 1);
  assert.equal(sections[0].heading, "");
  assert.equal(sections[0].body, "Just one paragraph of advice.");
});

test("weekly plan: empty text produces no cards", () => {
  assert.deepEqual(parsePlanSections("   \n"), []);
});

test("weekly plan: text before the first heading joins the first card", () => {
  const plan = "Lead line.\n## Irrigation\nWater deeply.";
  const sections = parsePlanSections(plan);
  assert.equal(sections.length, 1);
  assert.match(sections[0].body, /^Lead line\./);
});

test("weekly plan: odia body still maps to the right icon", () => {
  const plan = "## Irrigation\nବୃଷ୍ଟି ପରେ ପାଣି ଦିଅନ୍ତୁ।";
  const [section] = parsePlanSections(plan);
  const meta = sectionMeta(section.heading);
  assert.equal(meta.emoji, "💧");
  assert.equal(meta.label, "Irrigation");
});

test("weekly plan: unknown heading keeps its own words", () => {
  const meta = sectionMeta("Something new");
  assert.equal(meta.label, "Something new");
  assert.equal(meta.emoji, "🌱");
});

test("weekly plan: bullets and blank lines survive as plain lines", () => {
  assert.deepEqual(plainLines("- one\n\n- two\n"), ["- one", "- two"]);
});
