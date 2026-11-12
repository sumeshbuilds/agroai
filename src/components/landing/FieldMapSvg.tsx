interface FieldMapSvgProps {
  idPrefix?: string;
  className?: string;
  label?: string;
  camera?: boolean;
}

/**
 * Crisp vector survey imagery for the landing page. This is a diagram of a
 * mapped field, not a photograph or a claim about real land.
 */
export function FieldMapSvg({
  idPrefix = "field",
  className = "",
  label = "Illustrative mapped field with a saved boundary, a camera position and one detection.",
  camera = true,
}: FieldMapSvgProps) {
  return (
    <svg
      viewBox="0 0 800 560"
      className={className}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id={`${idPrefix}-rows`}
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(18)"
        >
          <path d="M0 0v14" stroke="#08130c" strokeWidth="1.2" opacity="0.28" />
        </pattern>
        <pattern
          id={`${idPrefix}-orchard`}
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="6" cy="6" r="1.8" fill="#07110b" opacity="0.34" />
          <circle cx="18" cy="18" r="1.8" fill="#07110b" opacity="0.34" />
        </pattern>
        <linearGradient id={`${idPrefix}-water`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d4141" />
          <stop offset="1" stopColor="#173438" />
        </linearGradient>
      </defs>

      <rect width="800" height="560" fill="#101f18" />

      {/* Field parcels */}
      <path d="M-20-20h300l-16 150-122 42L-26 150Z" fill="#253a2a" />
      <path d="M-20-20h300l-16 150-122 42L-26 150Z" fill={`url(#${idPrefix}-rows)`} />

      <path d="M280-20h268l34 120-106 98-142-48-38-40Z" fill="#2d4630" />
      <path d="M280-20h268l34 120-106 98-142-48-38-40Z" fill={`url(#${idPrefix}-rows)`} />

      <path d="M548-20h300v204l-178 26-88-130Z" fill="#384f32" />
      <path d="M548-20h300v204l-178 26-88-130Z" fill={`url(#${idPrefix}-orchard)`} />

      <path d="M-26 150l122-42 76 56 216 54 130 34-36 178-204 36-160-88L-26 322Z" fill="#1f3627" />
      <path d="M-26 150l122-42 76 56 216 54 130 34-36 178-204 36-160-88L-26 322Z" fill={`url(#${idPrefix}-rows)`} />

      <path d="M518 274l220 46-14 190-242 30-8-220Z" fill="#42512e" />
      <path d="M518 274l220 46-14 190-242 30-8-220Z" fill={`url(#${idPrefix}-orchard)`} />

      <path d="M282 150l236 30-22 138-244-14Z" fill="#30482b" />
      <path d="M282 150l236 30-22 138-244-14Z" fill={`url(#${idPrefix}-rows)`} />

      <path d="M-20 420h260l-10 160H-20Z" fill="#3a4a2e" />
      <path d="M-20 420h260l-10 160H-20Z" fill={`url(#${idPrefix}-rows)`} />

      <path d="M340 398h180l-22 162H320Z" fill="#354a2c" />
      <path d="M340 398h180l-22 162H320Z" fill={`url(#${idPrefix}-orchard)`} />

      {/* Watercourse */}
      <path
        d="M-10 380c92-12 132 34 206 20 58-11 76-58 142-62 64-4 104 30 166 14 54-14 88-58 116-70v54c-38 18-72 62-128 76-72 18-116-18-170-12-56 6-82 52-144 62-70 11-126-26-188-14Z"
        fill={`url(#${idPrefix}-water)`}
        opacity="0.9"
      />

      {/* Road */}
      <path
        d="M-40 250c128 10 182 98 310 108 120 9 230-58 352-46 52 5 92 16 138 34"
        fill="none"
        stroke="#5b5d43"
        strokeWidth="14"
        opacity="0.5"
      />
      <path
        d="M-40 250c128 10 182 98 310 108 120 9 230-58 352-46 52 5 92 16 138 34"
        fill="none"
        stroke="#8d8a62"
        strokeWidth="1.5"
        strokeDasharray="10 14"
        opacity="0.65"
      />

      {/* Parcel seams */}
      <g fill="none" stroke="#0a1710" strokeWidth="2" opacity="0.7">
        <path d="M280 0v150M548 0l-2 210M282 150l-2 250M518 274l-2 232M280 400h-2M340 400v160" />
      </g>

      {/* Saved boundary */}
      <g>
        <path
          d="M318 196l172 22 30 94-34 78-148-8-46-94Z"
          fill="#c9f26c"
          fillOpacity="0.09"
          stroke="#c9f26c"
          strokeWidth="2.4"
          strokeDasharray="9 7"
          strokeLinejoin="round"
        />
        {[
          [318, 196],
          [490, 218],
          [520, 312],
          [486, 390],
          [300, 382],
          [254, 288],
        ].map(([x, y]) => (
          <g key={`${idPrefix}-${x}-${y}`}>
            <circle cx={x} cy={y} r="5.2" fill="#c9f26c" />
            <circle cx={x} cy={y} r="9" fill="none" stroke="#c9f26c" strokeOpacity="0.4" />
          </g>
        ))}
        <text
          x="386"
          y="306"
          textAnchor="middle"
          fill="#f5f1e6"
          fontSize="15"
          fontWeight="700"
          letterSpacing="1.6"
        >
          NORTH FIELD
        </text>
        <text
          x="386"
          y="326"
          textAnchor="middle"
          fill="#c9f26c"
          fontSize="11"
          letterSpacing="1.2"
        >
          2.4 ACRES · 0.97 HA
        </text>
      </g>

      {/* Camera position and field of view */}
      {camera ? (
        <g>
          <path
            d="M584 128 414 274l132 34 70-166Z"
            fill="#c9f26c"
            fillOpacity="0.12"
            stroke="#c9f26c"
            strokeOpacity="0.35"
            strokeWidth="1"
          />
          <path
            d="M584 128 512 258h144Z"
            fill="#c9f26c"
            fillOpacity="0.16"
            className="landing-pin"
          />
          <circle cx="584" cy="128" r="20" fill="#c9f26c" fillOpacity="0.15" className="landing-pin" />
          <circle cx="584" cy="128" r="13" fill="#c9f26c" />
          <path
            d="M584 122a6 6 0 0 0-6 6v4h12v-4a6 6 0 0 0-6-6Zm-8 11h16v5h-16Zm4 7h8l-2 3h-4Z"
            fill="#11261b"
            transform="translate(-2 -2)"
          />
          <text x="606" y="120" fill="#f5f1e6" fontSize="11" fontWeight="700" letterSpacing="1">
            CAM 01
          </text>
          <text x="606" y="134" fill="#a9c39d" fontSize="10">
            LIVE · 1.8s
          </text>
        </g>
      ) : null}

      {/* Confirmed detection */}
      <g>
        <rect
          x="414"
          y="274"
          width="132"
          height="74"
          rx="4"
          fill="none"
          stroke="#c9f26c"
          strokeWidth="2"
        />
        <path d="M414 274h22M414 274v22M546 348h-22M546 348v-22" stroke="#f5f1e6" strokeWidth="3" />
        <rect x="414" y="244" width="126" height="24" rx="5" fill="#c9f26c" />
        <text x="426" y="261" fill="#11261b" fontSize="11.5" fontWeight="800" letterSpacing="0.4">
          ANIMAL · 0.91
        </text>
      </g>

      {/* Compass and scale are drawn as UI chrome, not map content */}
      <g opacity="0.8">
        <path d="M-2 520h44" stroke="#f5f1e6" strokeWidth="2" />
        <path d="M-2 515v10M42 515v10" stroke="#f5f1e6" strokeWidth="2" />
        <text x="50" y="524" fill="#f5f1e6" fontSize="10" letterSpacing="0.8">
          50 m
        </text>
      </g>
    </svg>
  );
}
