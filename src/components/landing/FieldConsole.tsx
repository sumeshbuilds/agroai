import {
  BellRing,
  CloudRain,
  MapPin,
  PawPrint,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { AgroMark } from "./AgroMark";
import { FieldMapSvg } from "./FieldMapSvg";

const FORECAST = [42, 58, 74, 82, 61, 48, 38];

export function FieldConsole() {
  return (
    <div className="relative min-w-0">
      {/* Survey frame: a drawn sheet edge, not a decorative glow. */}
      <div
        aria-hidden
        className="absolute -inset-x-4 -top-4 bottom-8 rounded-[2rem] border border-dashed border-[var(--color-line-strong)] sm:-inset-x-6"
      />

      <div className="relative rounded-[1.8rem] bg-forest-deep p-2.5 shadow-[0_26px_60px_-30px_rgba(17,38,27,0.65)] ring-1 ring-white/10">
        <div className="overflow-hidden rounded-[1.35rem] bg-[#0c1912]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3.5 py-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <AgroMark className="h-8 w-8 shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-[0.78rem] font-semibold text-[#f5f1e6]">
                  North field
                </p>
                <p className="truncate text-[0.62rem] font-medium uppercase tracking-[0.16em] text-[#8fac92]">
                  Field console · preview
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-lime-field/15 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-lime-field">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-field" />
              Live
            </span>
          </div>

          <div className="relative h-[19rem] overflow-hidden sm:aspect-[1.28] sm:h-auto sm:min-h-[300px]">
            <FieldMapSvg
              idPrefix="hero-field"
              className="absolute inset-0 h-full w-full"
              label="Illustrative field console showing a saved field boundary, a live phone camera and a confirmed animal detection."
            />

            {/* Weather chip */}
            <div className="absolute right-3 top-3 w-[9.8rem] rounded-xl bg-paper-warm p-2.5 shadow-[0_10px_24px_-14px_rgba(0,0,0,0.6)]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.13em] text-[var(--color-ink-soft)]">
                    North field
                  </p>
                  <p className="mt-0.5 text-xl font-semibold leading-none text-forest-deep">
                    28°
                  </p>
                </div>
                <CloudRain aria-hidden className="mt-0.5 h-4 w-4 text-[var(--color-info-600)]" />
              </div>
              <p className="mt-1.5 text-[0.64rem] font-medium leading-snug text-[var(--color-ink-soft)]">
                Rain by 4 pm · 82%
              </p>
              <div className="mt-2 flex h-7 items-end gap-1" aria-hidden>
                {FORECAST.map((value, index) => (
                  <span
                    key={index}
                    className="flex-1 rounded-sm bg-[var(--color-info-400)]"
                    style={{ height: `${value}%`, opacity: 0.45 + value / 160 }}
                  />
                ))}
              </div>
            </div>

            {/* Camera status */}
            <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-forest-deep/90 px-2.5 py-1 text-[0.62rem] font-semibold text-[#dbe7d3] ring-1 ring-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-field" />
              CAM 01 online
            </div>

            {/* Field alarm */}
            <div className="landing-alert absolute inset-x-3 bottom-3 rounded-xl bg-[#f9efe2] p-2.5 shadow-[0_16px_36px_-18px_rgba(0,0,0,0.8)] sm:inset-x-auto sm:left-3 sm:w-[19rem]">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-danger-100)] text-[var(--color-danger-600)]">
                  <BellRing aria-hidden className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.72rem] font-bold text-forest-deep">
                      Animal at the boundary
                    </p>
                    <span className="shrink-0 rounded-full bg-[var(--color-danger-500)] px-1.5 py-0.5 text-[0.52rem] font-bold uppercase tracking-[0.1em] text-white">
                      Alert
                    </span>
                  </div>
                  <p className="mt-0.5 text-[0.63rem] leading-snug text-[var(--color-ink-soft)]">
                    Cow · confirmed 0.91 · just now
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[0.6rem] font-semibold text-[var(--color-danger-700)]">
                    <span className="rounded bg-white/70 px-1.5 py-0.5">Review</span>
                    <span className="font-medium text-[var(--color-ink-soft)]">Siren armed</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 px-3.5 py-3 sm:px-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.15em] text-[#8fac92]">
                Detection feed
              </p>
              <p className="text-[0.58rem] font-medium text-[#8fac92]">
                Person + animal only
              </p>
            </div>
            <ul className="space-y-1.5">
              <li className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5">
                <UserRound aria-hidden className="h-3.5 w-3.5 text-[#b9cbb4]" />
                <span className="flex-1 text-[0.68rem] font-medium text-[#e8f0e2]">
                  Person · north gate
                </span>
                <span className="text-[0.62rem] font-semibold tabular-nums text-[#b9cbb4]">
                  0.94
                </span>
                <span className="text-[0.58rem] text-[#8fac92]">2 min</span>
              </li>
              <li className="flex items-center gap-2.5 rounded-lg bg-lime-field/10 px-2.5 py-1.5 ring-1 ring-lime-field/30">
                <PawPrint aria-hidden className="h-3.5 w-3.5 text-lime-field" />
                <span className="flex-1 text-[0.68rem] font-semibold text-[#f5f1e6]">
                  Cow · field boundary
                </span>
                <span className="text-[0.62rem] font-semibold tabular-nums text-lime-field">
                  0.91
                </span>
                <span className="text-[0.58rem] font-semibold text-lime-field">now</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[0.66rem] font-medium text-[var(--color-ink-soft)]">
        <span className="inline-flex items-center gap-1.5">
          <MapPin aria-hidden className="h-3 w-3" />
          Kalahandi, Odisha · illustrative console
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck aria-hidden className="h-3 w-3" />
          Raw video stays on the phone
        </span>
      </div>
    </div>
  );
}
