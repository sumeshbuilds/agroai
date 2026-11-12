interface AgroMarkProps {
  className?: string;
  title?: string;
}

/** Original AgroAI mark: a field row that grows into a leaf. */
export function AgroMark({ className = "h-10 w-10", title }: AgroMarkProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <rect width="40" height="40" rx="12" fill="#11261b" />
      <path
        d="M10 30.5c4.5-2.1 7.4-4.9 10-9.5 2.6 4.6 5.5 7.4 10 9.5"
        stroke="#4d6b52"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M20 30V15.5"
        stroke="#c9f26c"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M20 21.5c-.2-5 3-8.4 7.7-8.7-.1 4.9-3.1 8.2-7.7 8.7Z"
        fill="#c9f26c"
      />
      <path
        d="M19.6 25.1c-3.8-.2-6.6-2.6-6.9-6.5 4 0 6.6 2.4 6.9 6.5Z"
        fill="#7f9b5e"
      />
      <circle cx="30.4" cy="10.2" r="2.1" fill="#c9f26c" />
    </svg>
  );
}
