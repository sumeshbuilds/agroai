interface AgroMarkProps {
  className?: string;
  title?: string;
}

/**
 * The AgroAI mark: a seven-sided field plot with stepped furrows and the
 * morning sun held inside the boundary.
 */
export function AgroMark({ className = "h-10 w-10", title }: AgroMarkProps) {
  return (
    <svg
      viewBox="0 0 260 260"
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <g transform="translate(10 0)">
        <path
          d="M 116,12 L 32,62 L 14,146 L 46,210 L 116,248 L 206,200 L 226,134 L 196,56 Z M 118,29 L 183,67 L 207,128 L 203,138 L 155.8,138 L 90.0,44.0 Z M 77.73,53.98 L 149.87,157.0 L 196,157.0 L 196,171.0 L 142.58,171.0 L 66.27,62.02 Z M 53.73,69.98 L 132.87,183.0 L 186,183.0 L 186,197.0 L 125.58,197.0 L 42.27,78.02 Z"
          fill="#164027"
          fillRule="evenodd"
        />
        <circle cx="156" cy="94" r="23" fill="#d25c34" />
      </g>
    </svg>
  );
}

interface AgroWordmarkProps {
  className?: string;
}

/** The lowercase wordmark that sits beside the mark in every lockup. */
export function AgroWordmark({ className = "" }: AgroWordmarkProps) {
  return (
    <span
      className={`font-display font-extrabold lowercase leading-none tracking-[-0.045em] ${className}`}
    >
      agroai
    </span>
  );
}
