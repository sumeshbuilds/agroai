"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import {
  BellRing,
  Camera,
  Check,
  ClipboardList,
  CloudRain,
  Droplets,
  Map,
  PawPrint,
  Radar,
  ScanLine,
  Sprout,
  Sun,
  UserRound,
  Wind,
} from "lucide-react";

import { cn } from "@/lib/cn";

const TABS = [
  {
    id: "map",
    label: "Field map",
    blurb: "Boundaries, area, cameras",
    icon: Map,
  },
  {
    id: "watch",
    label: "Live watch",
    blurb: "People and animal alerts",
    icon: Radar,
  },
  {
    id: "scan",
    label: "Plant scan",
    blurb: "A cautious photo check",
    icon: ScanLine,
  },
  {
    id: "week",
    label: "This week",
    blurb: "Weather into a short plan",
    icon: ClipboardList,
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

const WEATHER = [
  { day: "Mon", icon: Sun, high: 31, rain: "10%" },
  { day: "Tue", icon: CloudRain, high: 29, rain: "70%" },
  { day: "Wed", icon: CloudRain, high: 28, rain: "85%" },
  { day: "Thu", icon: CloudRain, high: 27, rain: "60%" },
  { day: "Fri", icon: Sun, high: 30, rain: "20%" },
  { day: "Sat", icon: Sun, high: 32, rain: "5%" },
  { day: "Sun", icon: Sun, high: 33, rain: "5%" },
];

export function ShowcaseTabs() {
  const [active, setActive] = useState<TabId>("map");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((tab) => tab.id === active);
    const last = TABS.length - 1;
    let next = index;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = index === last ? 0 : index + 1;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = index === 0 ? last : index - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = last;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = TABS[next];
    setActive(nextTab.id);
    tabRefs.current[nextTab.id]?.focus();
  };

  const activeTab = TABS.find((tab) => tab.id === active) ?? TABS[0];

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-7">
      <div className="min-w-0">
        <div
          role="tablist"
          aria-label="AgroAI workstation screens"
          aria-orientation="vertical"
          onKeyDown={handleKeyDown}
          className="grid w-full max-w-full grid-cols-2 gap-2 lg:flex lg:flex-col"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[tab.id] = node;
                }}
                type="button"
                role="tab"
                id={`showcase-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`showcase-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(tab.id)}
                className={cn(
                  "group flex min-h-[3.6rem] w-full shrink-0 items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors",
                  selected
                    ? "border-forest-deep bg-forest-deep text-paper-warm"
                    : "border-[var(--color-line-strong)] bg-card text-forest-deep hover:border-leaf-600",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                    selected
                      ? "bg-lime-field text-forest-deep"
                      : "bg-leaf-100 text-leaf-700",
                  )}
                >
                  <Icon aria-hidden className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.82rem] font-bold">{tab.label}</span>
                  <span
                    className={cn(
                      "hidden text-[0.68rem] sm:block",
                      selected ? "text-paper-warm/65" : "text-[var(--color-ink-soft)]",
                    )}
                  >
                    {tab.blurb}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 hidden rounded-2xl border border-[var(--color-line)] bg-paper-warm p-4 lg:block">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
            Example data
          </p>
          <p className="mt-1.5 text-[0.76rem] leading-relaxed text-[var(--color-ink-soft)]">
            These screens use illustrative farm data. After you sign in they show
            your own boundary, crop and camera.
          </p>
        </div>
      </div>

      <div
        role="tabpanel"
        id={`showcase-panel-${active}`}
        aria-labelledby={`showcase-tab-${active}`}
        tabIndex={0}
        className="min-w-0 rounded-[1.8rem] border border-[var(--color-line)] bg-card p-2 shadow-[0_18px_44px_-30px_rgba(34,54,42,0.35)]"
      >
        <div className="flex items-center justify-between gap-3 rounded-t-[1.3rem] border-b border-[var(--color-line)] bg-paper-warm px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--color-danger-500)]/70" />
            <span className="h-2 w-2 rounded-full bg-[var(--color-warn-500)]/70" />
            <span className="h-2 w-2 rounded-full bg-leaf-500/70" />
            <span className="ml-2 text-[0.68rem] font-semibold text-[var(--color-ink-soft)]">
              AgroAI / {activeTab.label}
            </span>
          </div>
          <span className="rounded-full bg-leaf-100 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-leaf-700">
            Example
          </span>
        </div>

        <div key={active} className="animate-rise rounded-b-[1.3rem] p-4 sm:p-5">
          {active === "map" ? <MapScreen /> : null}
          {active === "watch" ? <WatchScreen /> : null}
          {active === "scan" ? <ScanScreen /> : null}
          {active === "week" ? <WeekScreen /> : null}
        </div>
      </div>
    </div>
  );
}

function MapScreen() {
  return (
    <div className="grid gap-4 md:grid-cols-[1.45fr_0.9fr]">
      <div className="relative min-h-[17rem] overflow-hidden rounded-2xl bg-forest-deep">
        <MapIllustration />
        <div className="absolute left-3 top-3 rounded-lg bg-paper-warm px-2.5 py-1.5 shadow-sm">
          <p className="text-[0.55rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
            Saved boundary
          </p>
          <p className="text-[0.76rem] font-bold text-forest-deep">North field</p>
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-end justify-between gap-2">
          <div className="rounded-lg bg-forest-deep/90 px-2.5 py-1.5 text-paper-warm ring-1 ring-white/10">
            <p className="text-[0.55rem] font-bold uppercase tracking-[0.13em] text-paper-warm/60">
              Area
            </p>
            <p className="text-[0.76rem] font-bold tabular-nums">
              2.4 acres · 0.97 ha
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-lime-field px-2 py-1 text-[0.58rem] font-bold uppercase tracking-[0.1em] text-forest-deep">
            <Camera aria-hidden className="h-3 w-3" />
            1 camera
          </span>
        </div>
      </div>

      <div className="rounded-2xl bg-card-muted p-4">
        <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
          Field record
        </p>
        <h4 className="mt-1 text-lg font-bold tracking-tight text-forest-deep">
          North field
        </h4>
        <dl className="mt-3 space-y-2 text-[0.74rem]">
          {[
            ["Crop", "Paddy · Day 42"],
            ["Soil", "Clay loam"],
            ["Camera", "CAM 01 · online"],
            ["Last alert", "Cow · 8 min ago"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-3 border-b border-[var(--color-line)] pb-2 last:border-0 last:pb-0"
            >
              <dt className="text-[var(--color-ink-soft)]">{label}</dt>
              <dd className="text-right font-semibold text-forest-deep">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 rounded-xl border border-leaf-300 bg-leaf-100/70 px-3 py-2 text-[0.68rem] leading-relaxed text-leaf-700">
          <span className="font-bold">One field, three units.</span> Every boundary
          is saved in acres, hectares and square metres.
        </div>
      </div>
    </div>
  );
}

function WatchScreen() {
  return (
    <div className="grid gap-4 md:grid-cols-[1.35fr_0.95fr]">
      <div className="relative min-h-[17rem] overflow-hidden rounded-2xl bg-[#0b1711]">
        <CameraIllustration />
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#0b1711]/85 px-2 py-1 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-lime-field ring-1 ring-white/10">
          <span className="h-1.5 w-1.5 rounded-full bg-lime-field" />
          Live · 1.2s
        </div>
        <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-paper-warm px-2.5 py-1 text-[0.62rem] font-bold text-forest-deep shadow-sm">
          <Camera aria-hidden className="h-3 w-3" />
          CAM 01 · rear camera
        </div>
        <div className="landing-scanline pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[linear-gradient(90deg,transparent,var(--color-lime-field),transparent)]" />
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-[var(--color-line)] bg-card p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
              Detection feed
            </p>
            <span className="rounded-full bg-[var(--color-danger-100)] px-1.5 py-0.5 text-[0.54rem] font-bold uppercase tracking-[0.1em] text-[var(--color-danger-700)]">
              1 new
            </span>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            <li className="flex items-center gap-2 rounded-lg bg-lime-field/15 px-2 py-1.5">
              <PawPrint aria-hidden className="h-3.5 w-3.5 text-leaf-700" />
              <span className="flex-1 text-[0.7rem] font-semibold text-forest-deep">
                Cow · boundary
              </span>
              <span className="text-[0.62rem] font-bold tabular-nums text-leaf-700">0.91</span>
            </li>
            <li className="flex items-center gap-2 px-2 py-1.5">
              <UserRound aria-hidden className="h-3.5 w-3.5 text-[var(--color-ink-soft)]" />
              <span className="flex-1 text-[0.7rem] text-forest-deep">Person · gate</span>
              <span className="text-[0.62rem] font-semibold tabular-nums text-[var(--color-ink-soft)]">
                0.94
              </span>
            </li>
            <li className="flex items-center gap-2 px-2 py-1.5">
              <PawPrint aria-hidden className="h-3.5 w-3.5 text-[var(--color-ink-soft)]" />
              <span className="flex-1 text-[0.7rem] text-forest-deep">Dog · track</span>
              <span className="text-[0.62rem] font-semibold tabular-nums text-[var(--color-ink-soft)]">
                0.83
              </span>
            </li>
          </ul>
        </div>

        <div className="rounded-2xl bg-[#f9efe2] p-3.5">
          <div className="flex items-start gap-2">
            <BellRing aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger-600)]" />
            <div>
              <p className="text-[0.74rem] font-bold text-forest-deep">
                Animal alarm
              </p>
              <p className="mt-0.5 text-[0.66rem] leading-relaxed text-[var(--color-ink-soft)]">
                Confirmed track, siren armed. Vehicles are ignored on purpose.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScanScreen() {
  return (
    <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
      <div className="relative flex min-h-[17rem] items-center justify-center overflow-hidden rounded-2xl bg-[#102019]">
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-paper-warm px-2 py-1 text-[0.58rem] font-bold uppercase tracking-[0.1em] text-forest-deep">
          <ScanLine aria-hidden className="h-3 w-3" />
          Example photo
        </div>
        <LeafIllustration />
        <div className="landing-scanline pointer-events-none absolute inset-x-6 top-1/2 h-[2px] bg-[linear-gradient(90deg,transparent,var(--color-lime-field),transparent)] shadow-[0_0_18px_2px_rgba(201,242,108,0.45)]" />
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-leaf-300 bg-leaf-100/60 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.58rem] font-bold uppercase tracking-[0.13em] text-leaf-700">
                Example result
              </p>
              <p className="mt-1 text-lg font-bold leading-tight text-forest-deep">
                Leaf spot
              </p>
            </div>
            <span className="rounded-full bg-plum-soft px-2 py-1 text-[0.6rem] font-bold text-plum">
              84% confidence
            </span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/70">
            <div className="h-full w-[84%] rounded-full bg-plum" />
          </div>
          <p className="mt-2 text-[0.68rem] leading-relaxed text-leaf-700">
            Fungal · moderate spread risk · confirm locally before treating.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-line)] bg-card p-3.5">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
            Do this now
          </p>
          <ul className="mt-2 space-y-1.5">
            {[
              "Remove the worst affected leaves.",
              "Keep the canopy dry at evening.",
              "Send a closer photo in 3 days.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-[0.7rem] leading-snug text-forest-deep">
                <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function WeekScreen() {
  return (
    <div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-2xl border border-[var(--color-line)] bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
              Example plan
            </p>
            <h4 className="mt-1 text-lg font-bold tracking-tight text-forest-deep">
              Paddy · week 6
            </h4>
          </div>
          <span className="rounded-full bg-leaf-100 px-2 py-1 text-[0.6rem] font-bold text-leaf-700">
            Flowering
          </span>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[0.64rem] font-semibold text-[var(--color-ink-soft)]">
            <span>Day 42 of 120</span>
            <span>35%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-card-muted">
            <div className="h-full w-[35%] rounded-full bg-plum" />
          </div>
        </div>

        <ul className="mt-4 space-y-2">
          {[
            { icon: Droplets, title: "Irrigate lightly before Thursday.", meta: "Rain is likely Thu", tone: "text-[var(--color-info-600)] bg-[var(--color-info-100)]" },
            { icon: ScanLine, title: "Scout the lower rows for stem borer.", meta: "10 minutes", tone: "text-plum bg-plum-soft" },
            { icon: CloudRain, title: "Hold the spray — rain coming.", meta: "Thu 85%", tone: "text-[var(--color-warn-700)] bg-[var(--color-warn-100)]" },
            { icon: Sprout, title: "Next stage in 6 days.", meta: "Grain fill", tone: "text-leaf-700 bg-leaf-100" },
          ].map((item) => (
            <li key={item.title} className="flex items-start gap-2.5">
              <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg", item.tone)}>
                <item.icon aria-hidden className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.7rem] font-semibold leading-snug text-forest-deep">
                  {item.title}
                </p>
                <p className="text-[0.6rem] text-[var(--color-ink-soft)]">{item.meta}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl bg-forest-deep p-4 text-paper-warm">
          <div className="flex items-center justify-between">
            <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-paper-warm/60">
              Field weather
            </p>
            <span className="text-[0.6rem] font-semibold text-paper-warm/60">
              Open-Meteo
            </span>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            28°<span className="ml-1 text-base font-medium text-paper-warm/60">C</span>
          </p>
          <p className="mt-0.5 text-[0.68rem] text-paper-warm/70">
            Light rain by 4 pm · soil moisture low
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            {WEATHER.map((day) => {
              const Icon = day.icon;
              return (
                <div
                  key={day.day}
                  className="flex flex-1 flex-col items-center gap-1 rounded-lg bg-white/[0.06] py-1.5"
                >
                  <span className="text-[0.54rem] font-semibold text-paper-warm/60">
                    {day.day}
                  </span>
                  <Icon aria-hidden className="h-3 w-3 text-lime-field" />
                  <span className="text-[0.58rem] font-bold tabular-nums">{day.high}°</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-plum-soft p-3.5">
          <div className="flex items-start gap-2">
            <Wind aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-plum" />
            <p className="text-[0.68rem] leading-relaxed text-plum-deep">
              <span className="font-bold">Not a sensor reading.</span> Forecast and
              model advice are guidance, not a field measurement.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MapIllustration() {
  return (
    <svg viewBox="0 0 420 300" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect width="420" height="300" fill="#13251a" />
      <path d="M-10-10h180l-12 98-74 30-94-34Z" fill="#2a432b" />
      <path d="M170-10h160l24 76-78 66-88-30-18-26Z" fill="#334c30" />
      <path d="M330-10h100v130l-94 14-30-78Z" fill="#40532f" />
      <path d="M-10 84l74-30 52 38 112 32 78 20-24 108-128 26-96-52-68-52Z" fill="#203a26" />
      <path d="M306 136l124 20-12 158-130 16-6-140Z" fill="#46562f" />
      <path d="M-10 200h146l-6 110H-10Z" fill="#3a4d2e" />
      <g stroke="#0b1710" strokeWidth="1" opacity="0.35">
        {Array.from({ length: 14 }).map((_, index) => (
          <path key={index} d={`M${index * 30} 0v300`} />
        ))}
        {Array.from({ length: 10 }).map((_, index) => (
          <path key={index} d={`M0 ${index * 30}h420`} />
        ))}
      </g>
      <path d="M-20 160c70 0 100 50 168 44 56-5 78-46 124-44 52 2 84 30 168 18" fill="none" stroke="#48604a" strokeWidth="9" opacity="0.6" />
      <path
        d="M148 96l104 14 20 68-24 56-96-6-32-68Z"
        fill="#c9f26c"
        fillOpacity="0.1"
        stroke="#c9f26c"
        strokeWidth="1.8"
        strokeDasharray="6 5"
      />
      <g fill="#c9f26c">
        {[
          [148, 96],
          [252, 110],
          [272, 178],
          [248, 234],
          [152, 228],
          [120, 160],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />
        ))}
      </g>
      <circle cx="308" cy="62" r="7" fill="#c9f26c" />
      <path d="M308 50a12 12 0 0 0-12 12c0 9 12 22 12 22s12-13 12-22a12 12 0 0 0-12-12Z" fill="#c9f26c" fillOpacity="0.2" stroke="#c9f26c" />
      <rect x="210" y="160" width="90" height="54" rx="3" fill="none" stroke="#f5f1e6" strokeWidth="1.6" />
      <rect x="210" y="142" width="82" height="16" rx="4" fill="#c9f26c" />
      <text x="217" y="153.5" fill="#11261b" fontSize="9" fontWeight="700">
        ANIMAL 0.91
      </text>
    </svg>
  );
}

function CameraIllustration() {
  return (
    <svg viewBox="0 0 420 300" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect width="420" height="300" fill="#0b1711" />
      <path d="M0 82h420v18H0Z" fill="#16291c" />
      <path d="M0 100h420v200H0Z" fill="#1e3622" />
      <path d="M0 100 420 100 420 300 0 300Z" fill="#233d25" opacity="0.55" />
      <g stroke="#0e2113" strokeWidth="3">
        {Array.from({ length: 16 }).map((_, index) => (
          <path key={index} d={`M${-60 + index * 44} 100L${90 + index * 30} 300`} />
        ))}
      </g>
      <path d="M0 250 420 210v90H0Z" fill="#2e4629" />
      <rect x="62" y="126" width="104" height="98" rx="3" fill="none" stroke="#c9f26c" strokeWidth="2" />
      <rect x="62" y="108" width="96" height="18" rx="4" fill="#c9f26c" />
      <text x="70" y="121" fill="#11261b" fontSize="10" fontWeight="700">
        ANIMAL 0.91
      </text>
      <rect x="254" y="164" width="72" height="118" rx="3" fill="none" stroke="#f5f1e6" strokeWidth="2" />
      <rect x="254" y="146" width="76" height="18" rx="4" fill="#f5f1e6" />
      <text x="261" y="159" fill="#11261b" fontSize="10" fontWeight="700">
        PERSON 0.94
      </text>
      <path d="M0 96h420" stroke="#c9f26c" strokeOpacity="0.2" />
    </svg>
  );
}

function LeafIllustration() {
  return (
    <svg viewBox="0 0 260 240" className="h-[13rem] w-[13rem]" aria-hidden>
      <path
        d="M128 214c-42-6-72-38-72-80 0-44 32-78 74-86 20 48 16 96-18 132-12 14-18 22-20 34Z"
        fill="#3c6b3c"
        stroke="#8fbc6a"
        strokeWidth="1.5"
      />
      <path d="M128 214c22-42 30-88 4-154" fill="none" stroke="#c9f26c" strokeWidth="2" />
      <g stroke="#8fbc6a" strokeWidth="1.4" opacity="0.85">
        <path d="M121 172c-18-10-28-24-32-42" />
        <path d="M124 152c20-10 30-24 34-44" />
        <path d="M128 128c-16-8-24-20-26-36" />
        <path d="M132 110c16-8 24-20 28-38" />
      </g>
      <g fill="#d9efb0" opacity="0.9">
        <circle cx="88" cy="120" r="4" />
        <circle cx="98" cy="146" r="3" />
        <circle cx="148" cy="130" r="4.5" />
        <circle cx="156" cy="100" r="3" />
        <circle cx="78" cy="94" r="3" />
      </g>
      <circle cx="128" cy="112" r="34" fill="none" stroke="#c9f26c" strokeOpacity="0.2" strokeDasharray="4 5" />
    </svg>
  );
}
