/**
 * Renders Schema.org structured data. `JSON.stringify` is not XSS-safe on its
 * own, so `<` is escaped before the string reaches the DOM.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
