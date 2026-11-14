/**
 * Splits a stored weekly action plan into the five sections the prompt asks
 * for, so the crops page can render icon cards instead of one wall of text.
 *
 * Works for both languages: the translator keeps the "## " headings in English
 * so the labels stay mappable, and any unexpected heading still renders.
 */

export interface PlanSection {
  heading: string;
  body: string;
}

export interface SectionMeta {
  emoji: string;
  /** English dictionary key for the card label. */
  label: string;
  tone: string;
}

const SECTIONS: Array<SectionMeta & { match: string }> = [
  { match: "irrigation", emoji: "💧", label: "Irrigation", tone: "bg-info-100" },
  {
    match: "fertil",
    emoji: "🧪",
    label: "Fertilizer & Spraying",
    tone: "bg-warn-100",
  },
  {
    match: "pest",
    emoji: "🐛",
    label: "Pest & Disease Watch",
    tone: "bg-danger-100",
  },
  {
    match: "field",
    emoji: "🚜",
    label: "Best Field-Work Days",
    tone: "bg-leaf-100",
  },
  { match: "next", emoji: "👉", label: "Next Step", tone: "bg-accent-50" },
];

const FALLBACK: SectionMeta = {
  emoji: "🌱",
  label: "Plan",
  tone: "bg-[var(--card-muted)]",
};

export function parsePlanSections(markdown: string): PlanSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: PlanSection[] = [];
  const preamble: string[] = [];
  let current: PlanSection | null = null;

  for (const raw of lines) {
    const heading = /^#{1,6}\s+(.*)$/.exec(raw.trim());
    if (heading) {
      if (current) sections.push(current);
      current = { heading: heading[1].trim(), body: "" };
      continue;
    }
    if (current) current.body += `${raw}\n`;
    else preamble.push(raw);
  }
  if (current) sections.push(current);

  if (sections.length === 0) {
    const text = preamble.join("\n").trim();
    return text ? [{ heading: "", body: text }] : [];
  }

  const lead = preamble.join("\n").trim();
  if (lead) sections[0].body = `${lead}\n${sections[0].body}`;

  return sections.map((section) => ({
    heading: section.heading,
    body: section.body.trim(),
  }));
}

/** Icon, translated label and tint for one section heading. */
export function sectionMeta(heading: string): SectionMeta {
  const lower = heading.toLowerCase();
  const hit = SECTIONS.find((entry) => lower.includes(entry.match));
  if (!hit) return heading ? { ...FALLBACK, label: heading } : FALLBACK;
  return { emoji: hit.emoji, label: hit.label, tone: hit.tone };
}

/** Strip markdown emphasis so a section can be rendered as plain text. */
export function plainLines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
