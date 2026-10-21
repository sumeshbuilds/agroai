import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Minimal, dependency-free markdown renderer for the AI advisory text.
 * Supports headings, bullets, numbered lists, **bold** and `code`. Renders to
 * React elements (never dangerouslySetInnerHTML).
 */
export function MarkdownLite({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={key} className="space-y-1.5">
        {bullets.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
            <span className="leading-relaxed">
              {renderInline(item, `${key}-${index}`)}
            </span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((raw, index) => {
    const line = raw.trim();

    if (!line) {
      flushBullets(`flush-${index}`);
      return;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushBullets(`flush-${index}`);
      blocks.push(
        <h3
          key={index}
          className="text-base font-bold text-brand-800 dark:text-brand-300"
        >
          {renderInline(heading[2], `h-${index}`)}
        </h3>,
      );
      return;
    }

    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }

    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      flushBullets(`flush-${index}`);
      blocks.push(
        <div key={index} className="flex gap-2">
          <span className="font-bold text-brand-700 dark:text-brand-300">
            {numbered[1]}.
          </span>
          <span className="leading-relaxed">
            {renderInline(numbered[2], `n-${index}`)}
          </span>
        </div>,
      );
      return;
    }

    flushBullets(`flush-${index}`);
    blocks.push(
      <p key={index} className="leading-relaxed">
        {renderInline(line, `p-${index}`)}
      </p>,
    );
  });

  flushBullets("flush-end");

  return <div className={cn("space-y-2.5", className)}>{blocks}</div>;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${tokenIndex}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${tokenIndex}`}
          className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }

    lastIndex = pattern.lastIndex;
    tokenIndex += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
