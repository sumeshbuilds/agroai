import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Camera,
  Check,
  ClipboardList,
  CloudRain,
  Droplets,
  Languages,
  MapPin,
  QrCode,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sprout,
  Sun,
  WifiOff,
} from "lucide-react";

import { FieldConsole } from "@/components/landing/FieldConsole";
import { FieldMapSvg } from "@/components/landing/FieldMapSvg";
import { LandingNav } from "@/components/landing/LandingNav";
import { ShowcaseTabs } from "@/components/landing/ShowcaseTabs";
import { AgroMark } from "@/components/landing/AgroMark";
import { getSessionFarmerId } from "@/lib/auth";

export const metadata: Metadata = {
  title: {
    absolute: "AgroAI — Your land, watched. Your crop, guided.",
  },
  description:
    "AgroAI turns a spare phone into a live field camera, maps your boundary from satellite imagery, and turns weather and crop stage into a short weekly plan. Built for Kalahandi, Odisha.",
  openGraph: {
    title: "AgroAI — Your land, watched. Your crop, guided.",
    description:
      "Land Security and Plant Security in one field workstation. Map, watch, scan and plan — on the phone and signal you already have.",
    type: "website",
  },
};

const SECURITY_LAND = [
  {
    icon: MapPin,
    title: "Map once",
    body: "Draw the boundary on satellite imagery. Area is saved in acres, hectares and m².",
  },
  {
    icon: Camera,
    title: "Pair a phone",
    body: "A spare phone becomes a live field camera with a QR code and a rear-camera view.",
  },
  {
    icon: BellRing,
    title: "Hear the real thing",
    body: "Confirmed person and animal tracks raise an alarm. Passing vehicles do not.",
  },
];

const SECURITY_PLANT = [
  {
    icon: Sprout,
    title: "Crop-day guide",
    body: "Stage, tasks and watch-outs from the crop you planted and the day you sowed it.",
  },
  {
    icon: CloudRain,
    title: "Field weather",
    body: "Seven days at the field centre, with soil moisture and rain, heat and wind warnings.",
  },
  {
    icon: ScanLine,
    title: "Photo plant check",
    body: "A careful AI read of a leaf photo, with actions and a clear confidence level.",
  },
];

const STEPS = [
  {
    label: "First",
    icon: MapPin,
    title: "Map the field",
    body: "Walk the boundary once. AgroAI saves the polygon, the centroid and the area for every later forecast.",
  },
  {
    label: "Then",
    icon: QrCode,
    title: "Pair a spare phone",
    body: "Scan a QR, point the rear camera at the field. People and animals are found on the phone itself.",
  },
  {
    label: "Every week",
    icon: ClipboardList,
    title: "Read the short plan",
    body: "Weather, crop stage and a leaf scan become a handful of actions you can actually finish.",
  },
];

const FIELD_FACTS = [
  {
    icon: Smartphone,
    title: "On-device eyes",
    body: "The phone finds people and animals locally. Raw video never leaves it.",
  },
  {
    icon: WifiOff,
    title: "Small frames, weak link",
    body: "Only small snapshots travel, so a hotspot is enough to keep watch.",
  },
  {
    icon: Sun,
    title: "Sunlight-first",
    body: "Large controls, strong contrast and a light-only screen for outdoor work.",
  },
  {
    icon: Languages,
    title: "Odia and English",
    body: "Switch language inside the app whenever that is the easier read.",
  },
  {
    icon: ShieldCheck,
    title: "Honest states",
    body: "Offline, waiting, unavailable and estimated are stated plainly — never filled in.",
  },
];

export default async function LandingPage() {
  const signedIn = (await getSessionFarmerId()) !== null;

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <LandingNav signedIn={signedIn} />

      <main id="main-content" tabIndex={-1} className="bg-paper-warm outline-none">
        {/* Hero ------------------------------------------------------------- */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="landing-hero-grid pointer-events-none absolute inset-y-0 left-0 right-0 opacity-60"
          />
          <div className="landing-shell relative grid gap-14 pb-12 pt-12 sm:pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-12 lg:pb-16 lg:pt-20">
            <div className="min-w-0 max-w-[38rem]">
              <h1 className="font-display text-[clamp(2.85rem,5.2vw,4.65rem)] font-extrabold leading-[0.94] tracking-[-0.04em] text-forest-deep">
                <span className="block">Your land,</span>
                <span className="block">watched.</span>
                <span className="block">Your crop,</span>
                <span className="block">
                  <mark className="inline-block bg-lime-field px-1.5 pb-0.5 text-forest-deep">
                    guided.
                  </mark>
                </span>
              </h1>

              <p className="mt-6 max-w-[34rem] text-[0.98rem] leading-relaxed text-[var(--color-ink-soft)] sm:text-[1.05rem]">
                AgroAI turns a spare phone into a live field camera, maps your
                boundary from satellite imagery, and turns this week&apos;s
                weather and crop stage into a short, doable plan. Built for
                Kalahandi, Odisha — and for days when the signal is weak.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href={signedIn ? "/dashboard" : "/onboarding"}
                  className="landing-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.9rem] font-bold transition-colors"
                >
                  {signedIn ? "Open my farm" : "Create your farm account"}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
                <a
                  href="#inside"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[var(--color-line-strong)] px-5 text-[0.88rem] font-bold text-forest-deep transition-colors hover:border-forest-deep"
                >
                  See inside the workstation
                  <ArrowRight aria-hidden className="h-4 w-4 rotate-90" />
                </a>
              </div>

              {!signedIn ? (
                <p className="mt-4 text-[0.8rem] font-medium text-[var(--color-ink-soft)]">
                  Already have a farm?{" "}
                  <Link
                    href="/login"
                    className="font-bold text-forest-deep underline decoration-leaf-400 underline-offset-4 hover:decoration-forest-deep"
                  >
                    Sign in
                  </Link>
                </p>
              ) : null}

              <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--color-line-strong)] pt-4 text-[0.7rem] font-semibold text-[var(--color-ink-soft)]">
                <li className="inline-flex items-center gap-1.5">
                  <Languages aria-hidden className="h-3.5 w-3.5" />
                  Odia + English
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
                  On-device detection
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <WifiOff aria-hidden className="h-3.5 w-3.5" />
                  Weak-signal ready
                </li>
              </ul>
            </div>

            <FieldConsole />
          </div>

          <div className="border-y border-[var(--color-line-strong)] bg-paper-warm/80">
            <div className="landing-shell grid grid-cols-2 gap-y-2 py-3 text-[0.62rem] font-bold uppercase tracking-[0.17em] text-[var(--color-ink-soft)] sm:grid-cols-4">
              <span className="border-l border-[var(--color-line-strong)] pl-3 first:border-0 first:pl-0">
                Map the boundary
              </span>
              <span className="border-l border-[var(--color-line-strong)] pl-3">
                Pair a phone
              </span>
              <span className="border-l border-[var(--color-line-strong)] pl-3">
                Scan a leaf
              </span>
              <span className="border-l border-[var(--color-line-strong)] pl-3">
                Read the week
              </span>
            </div>
          </div>
        </section>

        {/* Two securities --------------------------------------------------- */}
        <section
          id="land-security"
          className="scroll-mt-24 bg-canvas py-16 sm:py-20 lg:py-24"
        >
          <div className="landing-shell">
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
              <h2 className="max-w-lg font-display text-[clamp(2.15rem,3.8vw,3.5rem)] font-extrabold leading-[0.97] tracking-[-0.035em] text-forest-deep">
                Two securities. One field.
              </h2>
              <p className="max-w-xl text-[0.95rem] leading-relaxed text-[var(--color-ink-soft)] lg:justify-self-end">
                One half watches the boundary. The other watches the crop. They
                share the same field, the same weather and the same farmer — so
                you do not have to stitch four apps together.
              </p>
            </div>

            <div className="mt-10 grid gap-5 lg:grid-cols-12">
              <article className="relative overflow-hidden rounded-[2rem] bg-lime-field p-5 sm:p-7 lg:col-span-7 lg:p-8">
                <div className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-forest-deep/70">
                  <ShieldCheck aria-hidden className="h-4 w-4" />
                  Land Security
                </div>
                <h3 className="mt-4 max-w-lg font-display text-[clamp(1.9rem,3vw,3rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-forest-deep">
                  Watch over every boundary.
                </h3>
                <p className="mt-3 max-w-xl text-[0.88rem] leading-relaxed text-forest-deep/75">
                  Trace the field on satellite imagery, then keep a live camera
                  on it with the spare phone in your pocket. You hear about the
                  cow at the boundary — not every leaf that moves.
                </p>

                <ul className="mt-6 grid gap-4 border-t border-forest-deep/20 pt-4 sm:grid-cols-3">
                  {SECURITY_LAND.map((item) => (
                    <li key={item.title}>
                      <item.icon
                        aria-hidden
                        className="h-4 w-4 text-forest-deep"
                        strokeWidth={2.2}
                      />
                      <p className="mt-2 text-[0.78rem] font-bold text-forest-deep">
                        {item.title}
                      </p>
                      <p className="mt-1 text-[0.7rem] leading-relaxed text-forest-deep/70">
                        {item.body}
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="relative mt-7 overflow-hidden rounded-[1.4rem] bg-forest-deep p-1.5">
                  <div className="relative aspect-[16/8] overflow-hidden rounded-[1.05rem]">
                    <FieldMapSvg
                      idPrefix="land-panel"
                      className="absolute inset-0 h-full w-full"
                      label="Illustrative satellite map with a saved field boundary and a live phone camera."
                    />
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-paper-warm px-2.5 py-1 text-[0.58rem] font-bold text-forest-deep">
                      Boundary saved · 2.4 acres
                    </span>
                    <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-forest-deep/90 px-2.5 py-1 text-[0.58rem] font-bold text-lime-field ring-1 ring-white/10">
                      <span className="h-1.5 w-1.5 rounded-full bg-lime-field" />
                      CAM 01 online
                    </span>
                  </div>
                </div>
              </article>

              <article
                id="plant-security"
                className="relative scroll-mt-24 overflow-hidden rounded-[2rem] bg-plum-deep p-5 text-paper-warm sm:p-7 lg:col-span-5 lg:mt-10 lg:p-8"
              >
                <div className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-plum-soft/70">
                  <Sprout aria-hidden className="h-4 w-4" />
                  Plant Security
                </div>
                <h3 className="mt-4 font-display text-[clamp(1.9rem,3vw,3rem)] font-extrabold leading-[0.98] tracking-[-0.035em]">
                  Know what the crop needs.
                </h3>
                <p className="mt-3 text-[0.88rem] leading-relaxed text-paper-warm/70">
                  The crop has a calendar, the field has a forecast, and the leaf
                  has a camera. AgroAI turns all three into a short list — before
                  the week runs away.
                </p>

                <div className="mt-6 rounded-[1.3rem] bg-paper-warm p-4 text-forest-deep">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.56rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
                        This week
                      </p>
                      <p className="mt-0.5 text-[0.95rem] font-bold">Paddy · week 6</p>
                    </div>
                    <span className="rounded-full bg-leaf-100 px-2 py-1 text-[0.58rem] font-bold text-leaf-700">
                      Flowering
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-card-muted">
                    <div className="h-full w-[42%] rounded-full bg-plum" />
                  </div>
                  <ul className="mt-3 space-y-2">
                    {[
                      { icon: Droplets, text: "Water lightly before Thursday." },
                      { icon: ScanLine, text: "Scout the lower rows for borers." },
                      { icon: CloudRain, text: "Hold the spray — rain is coming." },
                    ].map((item) => (
                      <li
                        key={item.text}
                        className="flex items-center gap-2 text-[0.7rem] font-medium"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-leaf-100 text-leaf-700">
                          <item.icon aria-hidden className="h-3.5 w-3.5" />
                        </span>
                        {item.text}
                      </li>
                    ))}
                  </ul>
                </div>

                <ul className="mt-5 space-y-3">
                  {SECURITY_PLANT.map((item) => (
                    <li key={item.title} className="flex items-start gap-2.5">
                      <item.icon
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-lime-field"
                        strokeWidth={2.2}
                      />
                      <div>
                        <p className="text-[0.76rem] font-bold">{item.title}</p>
                        <p className="mt-0.5 text-[0.69rem] leading-relaxed text-paper-warm/65">
                          {item.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* Showcase --------------------------------------------------------- */}
        <section id="inside" className="scroll-mt-24 border-y border-[var(--color-line)] bg-paper-warm py-16 sm:py-20 lg:py-24">
          <div className="landing-shell">
            <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
              <h2 className="max-w-xl font-display text-[clamp(2.15rem,3.8vw,3.5rem)] font-extrabold leading-[0.97] tracking-[-0.035em] text-forest-deep">
                Look inside the workstation.
              </h2>
              <p className="max-w-xl text-[0.95rem] leading-relaxed text-[var(--color-ink-soft)] lg:justify-self-end">
                Four screens do the daily work. This is the same interface you get
                after signing in, shown here with example farm data.
              </p>
            </div>

            <div className="mt-9">
              <ShowcaseTabs />
            </div>
          </div>
        </section>

        {/* How it works ----------------------------------------------------- */}
        <section id="how-it-works" className="scroll-mt-24 bg-canvas py-16 sm:py-20 lg:py-24">
          <div className="landing-shell">
            <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
              <h2 className="max-w-lg font-display text-[clamp(2.15rem,3.8vw,3.5rem)] font-extrabold leading-[0.97] tracking-[-0.035em] text-forest-deep">
                One sitting to set up. A short check every day.
              </h2>
              <p className="max-w-xl text-[0.95rem] leading-relaxed text-[var(--color-ink-soft)] lg:justify-self-end">
                No sensor to buy, no new phone to learn. The pilot is built around
                the camera and connection a farmer already carries.
              </p>
            </div>

            <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
              {STEPS.map((step) => (
                <li key={step.title} className="border-t border-[var(--color-line-strong)] pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-deep text-lime-field">
                      <step.icon aria-hidden className="h-4 w-4" strokeWidth={2.1} />
                    </span>
                    <span className="text-[0.64rem] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
                      {step.label}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-xl font-bold tracking-[-0.02em] text-forest-deep">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-xs text-[0.82rem] leading-relaxed text-[var(--color-ink-soft)]">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Field conditions ------------------------------------------------- */}
        <section className="relative overflow-hidden bg-forest-deep py-16 text-paper-warm sm:py-20 lg:py-24">
          <ContourBackdrop />
          <div className="landing-shell relative">
            <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
              <div>
                <h2 className="max-w-lg font-display text-[clamp(2.15rem,3.8vw,3.5rem)] font-extrabold leading-[0.97] tracking-[-0.035em]">
                  Built for a weak signal and a bright sun.
                </h2>
                <p className="mt-4 max-w-lg text-[0.95rem] leading-relaxed text-paper-warm/65">
                  The pilot lives where a phone is shared, the network drops and the
                  screen has to be read at noon. Those conditions set the design, not
                  the demo.
                </p>

                <div className="mt-7 rounded-2xl border border-lime-field/25 bg-lime-field/[0.08] p-4">
                  <p className="font-display text-lg font-bold leading-snug text-lime-field">
                    No signal is a state, not a failure.
                  </p>
                  <p className="mt-1.5 text-[0.76rem] leading-relaxed text-paper-warm/65">
                    Detection keeps running on the phone. Confirmed events wait in a
                    bounded queue and upload when the link returns; the app says
                    when it is offline instead of pretending to be live.
                  </p>
                </div>
              </div>

              <ul className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
                {FIELD_FACTS.map((fact) => (
                  <li
                    key={fact.title}
                    className="border-t border-white/15 py-4 first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
                  >
                    <div className="flex items-center gap-2">
                      <fact.icon
                        aria-hidden
                        className="h-4 w-4 text-lime-field"
                        strokeWidth={2.1}
                      />
                      <p className="text-[0.82rem] font-bold">{fact.title}</p>
                    </div>
                    <p className="mt-1.5 text-[0.76rem] leading-relaxed text-paper-warm/60">
                      {fact.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Final CTA -------------------------------------------------------- */}
        <section id="start" className="scroll-mt-24 bg-paper-warm py-16 sm:py-20 lg:py-24">
          <div className="landing-shell">
            <div className="relative overflow-hidden rounded-[2.2rem] bg-forest-deep p-6 text-paper-warm sm:p-10 lg:p-12">
              <div
                aria-hidden
                className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[28px] border-lime-field/15"
              />
              <div
                aria-hidden
                className="absolute -bottom-20 right-24 h-40 w-40 rotate-12 rounded-[2rem] bg-plum/30"
              />
              <div className="relative grid gap-10 lg:grid-cols-[1.12fr_0.88fr] lg:items-center">
                <div>
                  <h2 className="max-w-xl font-display text-[clamp(2.1rem,4vw,3.7rem)] font-extrabold leading-[0.96] tracking-[-0.04em]">
                    Start with the land you already know.
                  </h2>
                  <p className="mt-4 max-w-lg text-[0.95rem] leading-relaxed text-paper-warm/65">
                    Draw one boundary. Add the crop you have sown. Set a PIN. There
                    is no sensor to buy and no new phone to learn.
                  </p>
                  <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Link
                      href={signedIn ? "/dashboard" : "/onboarding"}
                      className="landing-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.9rem] font-bold transition-colors"
                    >
                      {signedIn ? "Open my farm" : "Create your farm account"}
                      <ArrowRight aria-hidden className="h-4 w-4" />
                    </Link>
                    {!signedIn ? (
                      <Link
                        href="/login"
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/25 px-5 text-[0.88rem] font-bold text-paper-warm transition-colors hover:border-lime-field hover:text-lime-field"
                      >
                        Sign in
                        <ArrowRight aria-hidden className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </div>
                  <p className="mt-4 text-[0.7rem] font-medium text-paper-warm/50">
                    Pilot build · Kalahandi, Odisha · English + Odia
                  </p>
                </div>

                <div className="relative mx-auto w-full max-w-[21rem] lg:rotate-[-1.5deg]">
                  <div className="rounded-[1.35rem] bg-paper-warm p-5 text-forest-deep shadow-[0_24px_50px_-28px_rgba(0,0,0,0.65)]">
                    <div className="flex items-center justify-between border-b border-forest-deep/15 pb-3">
                      <span className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-[0.14em]">
                        <AgroMark className="h-7 w-7" />
                        AgroAI
                      </span>
                      <span className="text-[0.56rem] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
                        Field pass
                      </span>
                    </div>
                    <p className="mt-4 font-display text-2xl font-extrabold tracking-[-0.03em]">
                      Land + Plant
                    </p>
                    <p className="mt-1 text-[0.72rem] leading-relaxed text-[var(--color-ink-soft)]">
                      One field workstation, on the phone you already carry.
                    </p>
                    <ul className="mt-4 space-y-2 border-t border-dashed border-forest-deep/20 pt-3">
                      {["Map the boundary", "Watch with a spare phone", "Guide the crop week by week"].map(
                        (line) => (
                          <li key={line} className="flex items-center gap-2 text-[0.72rem] font-medium">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lime-field">
                              <Check aria-hidden className="h-3 w-3" strokeWidth={3} />
                            </span>
                            {line}
                          </li>
                        ),
                      )}
                    </ul>
                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div aria-hidden className="flex h-8 items-end gap-[2px]">
                        {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 2, 4, 1, 2].map((width, index) => (
                          <span
                            key={index}
                            className="h-full bg-forest-deep"
                            style={{ width: `${width}px` }}
                          />
                        ))}
                      </div>
                      <span className="text-right text-[0.55rem] font-bold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
                        Pilot · No. 001
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-line)] bg-paper-warm">
        <div className="landing-shell py-10 sm:py-12">
          <div className="grid gap-8 md:grid-cols-[1.2fr_0.7fr_0.7fr_1fr]">
            <div>
              <Link href="/" className="inline-flex items-center gap-2.5">
                <AgroMark className="h-10 w-10" />
                <span className="text-[1.2rem] font-bold tracking-[-0.03em] text-forest-deep">
                  AgroAI
                </span>
              </Link>
              <p className="mt-3 max-w-xs text-[0.78rem] leading-relaxed text-[var(--color-ink-soft)]">
                The field workstation for small farms: land security, plant
                guidance and a camera made from a spare phone.
              </p>
            </div>

            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
                The app
              </p>
              <ul className="mt-3 space-y-2 text-[0.78rem] font-medium text-forest-deep">
                <li><Link href="/onboarding" className="hover:underline">Create account</Link></li>
                <li><Link href="/login" className="hover:underline">Sign in</Link></li>
                <li><a href="#inside" className="hover:underline">Inside AgroAI</a></li>
              </ul>
            </div>

            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
                Security
              </p>
              <ul className="mt-3 space-y-2 text-[0.78rem] font-medium text-forest-deep">
                <li><a href="#land-security" className="hover:underline">Land security</a></li>
                <li><a href="#plant-security" className="hover:underline">Plant security</a></li>
                <li><a href="#how-it-works" className="hover:underline">How it works</a></li>
              </ul>
            </div>

            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
                Built for
              </p>
              <ul className="mt-3 space-y-2 text-[0.78rem] font-medium text-forest-deep">
                <li>Weak connections</li>
                <li>Outdoor sunlight</li>
                <li>Odia + English</li>
              </ul>
            </div>
          </div>

          <div className="mt-9 flex flex-col gap-3 border-t border-[var(--color-line)] pt-5 text-[0.68rem] leading-relaxed text-[var(--color-ink-soft)] sm:flex-row sm:items-end sm:justify-between">
            <p>
              © 2026 AgroAI · Pilot build in Kalahandi, Odisha. Field data stays
              scoped to the signed-in farmer.
            </p>
            <p className="max-w-md sm:text-right">
              Guidance is advisory, not a field measurement. Confirm treatment and
              pesticide decisions locally before acting.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}

function ContourBackdrop() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 900 700"
      className="pointer-events-none absolute -right-20 top-1/2 h-[42rem] w-[42rem] -translate-y-1/2 opacity-[0.13]"
      fill="none"
    >
      <g stroke="var(--color-lime-field)" strokeWidth="1.4">
        <path d="M180 60c100-22 190 6 220 76 26 60-8 112-70 132-64 21-132 4-158-48-22-45 6-90 62-110 50-18 104-8 124 28" />
        <path d="M136 96c100-22 190 6 220 76 26 60-8 112-70 132-64 21-132 4-158-48-22-45 6-90 62-110 50-18 104-8 124 28" />
        <path d="M92 132c100-22 190 6 220 76 26 60-8 112-70 132-64 21-132 4-158-48-22-45 6-90 62-110 50-18 104-8 124 28" />
        <path d="M48 168c100-22 190 6 220 76 26 60-8 112-70 132-64 21-132 4-158-48-22-45 6-90 62-110 50-18 104-8 124 28" />
        <path d="M350 300c120-30 230 20 260 110 26 80-40 150-130 158-88 8-166-48-168-120-2-58 38-110 108-130" />
        <path d="M300 348c120-30 230 20 260 110 26 80-40 150-130 158-88 8-166-48-168-120-2-58 38-110 108-130" />
        <path d="M250 396c120-30 230 20 260 110 26 80-40 150-130 158-88 8-166-48-168-120-2-58 38-110 108-130" />
      </g>
    </svg>
  );
}
