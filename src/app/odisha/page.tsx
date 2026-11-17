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

import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNav } from "@/components/landing/LandingNav";
import { JsonLd } from "@/components/seo/JsonLd";
import { getSessionFarmerId } from "@/lib/auth";
import { SITE_LOCALE, SITE_NAME, absoluteUrl } from "@/lib/site";
import type { FaqEntry } from "@/lib/structured-data";
import { odishaPageSchema } from "@/lib/structured-data";

const PAGE_URL = absoluteUrl("/odisha");
const PAGE_TITLE = "AgroAI Odisha | Agricultural Startup in Odisha & Kalinga";
const PAGE_DESCRIPTION =
  "AgroAI is an agricultural startup in Odisha (Kalinga), piloted in Kalahandi. Map your field, watch it with a spare phone, and guide the crop in Odia or English.";

export const metadata: Metadata = {
  title: { absolute: PAGE_TITLE },
  description: PAGE_DESCRIPTION,
  keywords: [
    "AgroAI Odisha",
    "AgroAI Kalinga",
    "agricultural startup in Odisha",
    "agri-tech startup Odisha",
    "Kalinga agriculture",
    "Kalahandi farming app",
    "Odia farm app",
    "smart farming Odisha",
  ],
  alternates: { canonical: "/odisha" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    type: "website",
    url: "/odisha",
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "AgroAI — farm security and crop guidance for Odisha and Kalinga",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

const CAPABILITIES = [
  {
    icon: MapPin,
    title: "Map the boundary once",
    body: "Trace the field on satellite imagery. AgroAI saves the polygon, the centre point and the area in acres, hectares and m².",
  },
  {
    icon: Camera,
    title: "Watch with a spare phone",
    body: "Scan a QR code, point the rear camera at the field. People and animals are detected on the phone itself, so raw video never leaves it.",
  },
  {
    icon: CloudRain,
    title: "Weather at the field centre",
    body: "Seven days of local rain, heat, wind and soil moisture, turned into go / care / wait windows for spraying, irrigation and harvest.",
  },
  {
    icon: ClipboardList,
    title: "A crop-day guide",
    body: "Add the crop and the sowing date. The guide shows the stage, the tasks for this week and the watch-outs that come next.",
  },
  {
    icon: ScanLine,
    title: "Scan a leaf",
    body: "A photo of an affected plant part returns the most likely disease, pest or nutrient problem — with a confidence level and next actions.",
  },
  {
    icon: Droplets,
    title: "Read the Soil Health Card",
    body: "Enter pH, EC, organic carbon, N, P, K and texture. AgroAI explains each limit and ranks 22 locally relevant crops against the soil.",
  },
];

const ODIOSA_REASONS = [
  {
    icon: Smartphone,
    title: "One shared phone",
    body: "The pilot assumes a phone is shared, not owned by each worker. Nothing needs a new handset, a sensor kit or a monthly data plan.",
  },
  {
    icon: WifiOff,
    title: "A signal that comes and goes",
    body: "Detection keeps running on the device. Confirmed camera events wait in a bounded queue and upload when the link returns.",
  },
  {
    icon: Languages,
    title: "Odia and English side by side",
    body: "Switch language inside the app. Crop tasks, plant-scan actions and the weekly plan are written in both, not machine-dropped into one.",
  },
  {
    icon: Sun,
    title: "Read outdoors at noon",
    body: "Large controls, strong contrast and a light-only screen, because the field is bright and the work does not wait for shade.",
  },
];

const HONESTY_WORKS = [
  "Saved field boundaries, area and crop records on a real database",
  "On-device person and animal detection from a paired phone camera",
  "Seven-day Open-Meteo forecast, ET₀ and field-work windows",
  "Crop-stage tasks, a weekly plan and a live pest-risk score",
  "Plant-photo scans with a visible confidence level",
  "Odia and English interface, with a weak-signal state that says so",
];

const HONESTY_LIMITS = [
  "Forecasts are models, not measurements from a field sensor",
  "A photo scan is a second opinion, not a laboratory diagnosis",
  "Camera alerts do not establish identity or intent",
  "Dependable background push is not a finished capability",
  "Pesticide names still need local label review before use",
];

const FAQS: FaqEntry[] = [
  {
    question: "What is AgroAI Odisha?",
    answer:
      "AgroAI Odisha is the Odisha-focused build of AgroAI, a field workstation for small farms. It maps a field boundary from satellite imagery, watches the field with a spare phone camera, and turns local weather and crop stage into a short weekly plan. The pilot started in Kalahandi.",
  },
  {
    question: "Is AgroAI available in Kalinga?",
    answer:
      "Yes. Kalinga is the historical name for the region that today includes Odisha. AgroAI is not tied to one district: any farmer in Odisha can draw a boundary, add a crop and use the same build. Kalahandi is where the pilot is being tested first.",
  },
  {
    question: "Is AgroAI an agricultural startup in Odisha?",
    answer:
      "AgroAI is a farm-technology startup working from Odisha, with a pilot in Kalahandi. It focuses on land security and plant guidance for small and marginal holdings rather than on selling sensors or hardware.",
  },
  {
    question: "Which crops does AgroAI guide?",
    answer:
      "The crop guide covers crops grown around Kalahandi and across Odisha, including paddy, maize, cotton, pulses, groundnut and common vegetables. The soil-fit check ranks 22 locally relevant crops against Soil Health Card values and the local climate.",
  },
  {
    question: "Does AgroAI work without a strong internet connection?",
    answer:
      "Yes, within limits. The phone camera runs person and animal detection on the device, so raw video never leaves the phone; only a small confirmed-event photo is uploaded. Weather, crop plans and disease scans need a connection, and the app says when it is offline instead of inventing data.",
  },
  {
    question: "How do I start using AgroAI in Odisha?",
    answer:
      "Create a farm account, draw your field boundary on the satellite map, add the crop and sowing date, and open the dashboard. No sensor purchase is needed, and the interface switches between Odia and English.",
  },
  {
    question: "Is the crop and disease advice a guarantee?",
    answer:
      "No. Guidance is advisory. Weather is a model forecast, not a field measurement, and a photo scan returns a confidence level rather than a lab diagnosis. Confirm treatment and pesticide decisions locally before acting.",
  },
];

export default async function OdishaPage() {
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
            className="landing-hero-grid pointer-events-none absolute inset-0 opacity-60"
          />
          <div className="landing-shell relative grid gap-12 pb-14 pt-10 sm:pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:pb-20 lg:pt-16">
            <div className="min-w-0">
              <nav aria-label="Breadcrumb" className="mb-6">
                <ol className="flex flex-wrap items-center gap-2 text-[0.72rem] font-semibold text-[var(--color-ink-soft)]">
                  <li>
                    <Link href="/" className="hover:text-forest-deep hover:underline">
                      Home
                    </Link>
                  </li>
                  <li aria-hidden>/</li>
                  <li aria-current="page" className="text-forest-deep">
                    Odisha &amp; Kalinga
                  </li>
                </ol>
              </nav>

              <p className="text-[0.66rem] font-bold uppercase tracking-[0.18em] text-leaf-600">
                AgroAI Odisha · Kalinga · Kalahandi pilot
              </p>

              <h1 className="mt-4 font-display text-[clamp(2.5rem,4.9vw,4.3rem)] font-extrabold leading-[0.96] tracking-[-0.04em] text-forest-deep">
                An agricultural startup in Odisha, built for{" "}
                <mark className="inline-block bg-lime-field px-1.5 pb-0.5">
                  Kalinga&apos;s
                </mark>{" "}
                small farms.
              </h1>

              <p className="mt-6 max-w-[36rem] text-[1rem] leading-relaxed text-[var(--color-ink-soft)]">
                AgroAI started with a question from Kalahandi: what would a farm
                tool look like if it assumed a shared phone, an Odia reader and a
                signal that disappears in the afternoon? This page explains what
                AgroAI Odisha does, where the pilot stands, and what it does not
                claim yet.
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
                  href="#what"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[var(--color-line-strong)] px-5 text-[0.88rem] font-bold text-forest-deep transition-colors hover:border-forest-deep"
                >
                  What it does
                  <ArrowRight aria-hidden className="h-4 w-4 rotate-90" />
                </a>
              </div>

              <p className="mt-4 text-[0.78rem] font-medium text-[var(--color-ink-soft)]">
                Already farming with us?{" "}
                <Link
                  href="/login"
                  className="font-bold text-forest-deep underline decoration-leaf-400 underline-offset-4 hover:decoration-forest-deep"
                >
                  Sign in
                </Link>
              </p>
            </div>

            {/* Pilot note -------------------------------------------------- */}
            <aside className="relative rounded-[1.8rem] border border-forest-deep/15 bg-forest-deep p-5 text-paper-warm shadow-[0_26px_60px_-40px_rgba(17,38,27,0.9)] sm:p-7">
              <div
                aria-hidden
                className="absolute -right-10 -top-10 h-32 w-32 rounded-full border-[16px] border-lime-field/15"
              />
              <div className="relative">
                <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-lime-field">
                  Pilot field note
                </p>
                <p className="mt-2 font-display text-2xl font-extrabold tracking-[-0.03em]">
                  Kalahandi, Odisha
                </p>
                <p className="mt-2 text-[0.8rem] leading-relaxed text-paper-warm/65">
                  One field workstation for the boundary and the crop, tested
                  where the connection is uneven and the phone is shared.
                </p>

                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/15 pt-4">
                  {[
                    { term: "Region", detail: "Odisha (Kalinga)" },
                    { term: "Language", detail: "Odia + English" },
                    { term: "Hardware", detail: "A spare phone" },
                    { term: "Pilot", detail: "Kalahandi" },
                  ].map((item) => (
                    <div key={item.term}>
                      <dt className="text-[0.56rem] font-bold uppercase tracking-[0.14em] text-paper-warm/45">
                        {item.term}
                      </dt>
                      <dd className="mt-0.5 text-[0.8rem] font-semibold">
                        {item.detail}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-5 flex items-center gap-2 rounded-xl border border-lime-field/25 bg-lime-field/[0.08] px-3 py-2.5">
                  <ShieldCheck
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-lime-field"
                  />
                  <p className="text-[0.72rem] font-semibold leading-snug text-paper-warm/80">
                    Field data stays scoped to the signed-in farmer.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* What it does ---------------------------------------------------- */}
        <section
          id="what"
          className="scroll-mt-24 border-y border-[var(--color-line)] bg-canvas py-16 sm:py-20"
        >
          <div className="landing-shell">
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
              <h2 className="max-w-lg font-display text-[clamp(2rem,3.6vw,3.2rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-forest-deep">
                What AgroAI Odisha puts in one app.
              </h2>
              <p className="max-w-xl text-[0.95rem] leading-relaxed text-[var(--color-ink-soft)] lg:justify-self-end">
                Land security and plant guidance share the same field, the same
                weather and the same farmer — so a boundary map, a camera, a
                crop calendar and a leaf scan do not live in four different
                places.
              </p>
            </div>

            <ul className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((item) => (
                <li
                  key={item.title}
                  className="rounded-[1.4rem] border border-[var(--color-line-strong)] bg-card p-5"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-leaf-100 text-leaf-700">
                    <item.icon aria-hidden className="h-4 w-4" strokeWidth={2.1} />
                  </span>
                  <h3 className="mt-4 text-[0.95rem] font-bold text-forest-deep">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-[var(--color-ink-soft)]">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Why it looks different ------------------------------------------ */}
        <section className="bg-paper-warm py-16 sm:py-20">
          <div className="landing-shell">
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
              <h2 className="max-w-xl font-display text-[clamp(2rem,3.6vw,3.2rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-forest-deep">
                Why a farm tool built in Odisha looks different.
              </h2>
              <p className="max-w-xl text-[0.95rem] leading-relaxed text-[var(--color-ink-soft)] lg:justify-self-end">
                The design is set by Odisha field conditions, not by a demo
                desk. That changes the hardware, the language and the way the
                app behaves when the network drops.
              </p>
            </div>

            <div className="mt-9 grid gap-5 sm:grid-cols-2">
              {ODIOSA_REASONS.map((item, index) => (
                <article
                  key={item.title}
                  className="flex gap-4 rounded-[1.4rem] border border-[var(--color-line-strong)] bg-card p-5"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest-deep text-lime-field">
                    <item.icon aria-hidden className="h-4 w-4" strokeWidth={2.1} />
                  </span>
                  <div>
                    <p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-1 text-[0.95rem] font-bold text-forest-deep">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-[0.8rem] leading-relaxed text-[var(--color-ink-soft)]">
                      {item.body}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Kalahandi to Kalinga -------------------------------------------- */}
        <section className="bg-plum-deep py-16 text-paper-warm sm:py-20">
          <div className="landing-shell grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
            <div>
              <p className="text-[0.66rem] font-bold uppercase tracking-[0.18em] text-plum-soft/70">
                From Kalahandi to Kalinga
              </p>
              <h2 className="mt-3 max-w-lg font-display text-[clamp(2rem,3.6vw,3.3rem)] font-extrabold leading-[0.97] tracking-[-0.035em]">
                One pilot district. One shared build for Odisha.
              </h2>
              <p className="mt-4 max-w-lg text-[0.92rem] leading-relaxed text-paper-warm/70">
                Kalinga is the historical name for the region that today includes
                Odisha. AgroAI Kalinga is not a separate product: the same build
                that runs in Kalahandi can map a boundary in any district, because
                the field centre, the crop and the sowing date do the localising —
                not a city-specific app version.
              </p>
              <p className="mt-3 max-w-lg text-[0.92rem] leading-relaxed text-paper-warm/70">
                The crops reflect that: paddy, maize, cotton, pulses, groundnut
                and vegetables common across the state, ranked against the soil
                values a farmer already has on a Soil Health Card.
              </p>

              <ul className="mt-6 flex flex-wrap gap-2">
                {["Paddy", "Maize", "Cotton", "Pulses", "Groundnut", "Vegetables"].map(
                  (crop) => (
                    <li
                      key={crop}
                      className="rounded-full border border-white/20 px-3 py-1.5 text-[0.72rem] font-semibold text-paper-warm/80"
                    >
                      {crop}
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div className="rounded-[1.6rem] border border-white/15 bg-white/[0.04] p-5 sm:p-6">
              <h3 className="text-[0.66rem] font-bold uppercase tracking-[0.18em] text-lime-field">
                What the pilot claims — and does not
              </h3>

              <div className="mt-4">
                <p className="text-[0.7rem] font-bold text-paper-warm">
                  Working today
                </p>
                <ul className="mt-2 space-y-2">
                  {HONESTY_WORKS.map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-2 text-[0.76rem] leading-relaxed text-paper-warm/75"
                    >
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-lime-field text-forest-deep">
                        <Check aria-hidden className="h-2.5 w-2.5" strokeWidth={3.4} />
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 border-t border-white/15 pt-4">
                <p className="text-[0.7rem] font-bold text-paper-warm">
                  Not claimed yet
                </p>
                <ul className="mt-2 space-y-2">
                  {HONESTY_LIMITS.map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-2 text-[0.76rem] leading-relaxed text-paper-warm/60"
                    >
                      <span
                        aria-hidden
                        className="mt-2 h-1 w-3 shrink-0 rounded-full bg-plum-soft/50"
                      />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ ------------------------------------------------------------- */}
        <section
          id="faq"
          className="scroll-mt-24 bg-canvas py-16 sm:py-20"
          aria-labelledby="faq-heading"
        >
          <div className="landing-shell grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
            <div>
              <p className="text-[0.66rem] font-bold uppercase tracking-[0.18em] text-leaf-600">
                Questions
              </p>
              <h2
                id="faq-heading"
                className="mt-3 max-w-sm font-display text-[clamp(2rem,3.6vw,3.2rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-forest-deep"
              >
                AgroAI Odisha, answered plainly.
              </h2>
              <p className="mt-4 max-w-sm text-[0.9rem] leading-relaxed text-[var(--color-ink-soft)]">
                If a question about the Odisha pilot is not here, the honest
                answer is probably on the homepage tour — or inside the app,
                where the states are labelled.
              </p>
            </div>

            <div className="border-t border-[var(--color-line-strong)]">
              {FAQS.map((faq) => (
                <details
                  key={faq.question}
                  className="group border-b border-[var(--color-line-strong)] py-4"
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[0.92rem] font-bold text-forest-deep [&::-webkit-details-marker]:hidden">
                    <span className="flex items-start gap-3">
                      <Sprout
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600"
                      />
                      {faq.question}
                    </span>
                    <span
                      aria-hidden
                      className="text-lg leading-none text-[var(--color-ink-soft)] transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-2 pl-7 text-[0.84rem] leading-relaxed text-[var(--color-ink-soft)]">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA ------------------------------------------------------------- */}
        <section className="bg-paper-warm pb-16 sm:pb-20">
          <div className="landing-shell">
            <div className="relative overflow-hidden rounded-[2rem] bg-forest-deep p-6 text-paper-warm sm:p-9">
              <div
                aria-hidden
                className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[26px] border-lime-field/15"
              />
              <div className="relative grid gap-7 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                <div>
                  <h2 className="max-w-lg font-display text-[clamp(1.9rem,3.4vw,3rem)] font-extrabold leading-[0.98] tracking-[-0.035em]">
                    Start with the field you already farm.
                  </h2>
                  <p className="mt-3 max-w-md text-[0.9rem] leading-relaxed text-paper-warm/65">
                    Draw one boundary, add the crop you have sown, set a PIN.
                    There is no sensor to buy and no new phone to learn.
                  </p>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Link
                      href={signedIn ? "/dashboard" : "/onboarding"}
                      className="landing-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[0.88rem] font-bold transition-colors"
                    >
                      {signedIn ? "Open my farm" : "Create your farm account"}
                      <ArrowRight aria-hidden className="h-4 w-4" />
                    </Link>
                    <a
                      href="#faq"
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/25 px-5 text-[0.86rem] font-bold text-paper-warm transition-colors hover:border-lime-field hover:text-lime-field"
                    >
                      Read the questions
                      <ArrowRight aria-hidden className="h-4 w-4" />
                    </a>
                  </div>
                </div>

                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {[
                    { icon: QrCode, text: "Pair a spare phone with a QR code" },
                    { icon: BellRing, text: "Hear confirmed person and animal tracks" },
                    { icon: MapPin, text: "Keep the boundary and area on record" },
                    { icon: ClipboardList, text: "Finish the week's short plan" },
                  ].map((item) => (
                    <li
                      key={item.text}
                      className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-3.5 py-3"
                    >
                      <item.icon
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-lime-field"
                      />
                      <span className="text-[0.78rem] font-medium text-paper-warm/80">
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <JsonLd
          data={odishaPageSchema({
            pageUrl: PAGE_URL,
            pageTitle: PAGE_TITLE,
            pageDescription: PAGE_DESCRIPTION,
            faqs: FAQS,
          })}
        />
      </main>

      <LandingFooter />
    </>
  );
}
