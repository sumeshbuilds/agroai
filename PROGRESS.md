# AgroAI — Implementation Progress Report

_Last updated: 21 October 2026_

This document tracks progress against the four root spec files:
[`README.md`](./README.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md),
[`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) and
[`OPENCODE_TASKS.md`](./OPENCODE_TASKS.md).

---

## 1. Summary

| Item | Status |
| --- | --- |
| Code complete (all 5 phases) | ✅ Done |
| Neon project linked (`neon init` → project `young-fog-71814202`, branch `production`) | ✅ Done |
| Database schema pushed to Neon (`npm run db:push`) | ✅ Done — 5 tables + FKs created |
| `npx tsc --noEmit` | ✅ Clean (0 errors) |
| `npm run build` | ✅ Succeeds (Turbopack, Next.js 16.4.2) |
| Runtime e2e against Neon | ✅ Farms/crops/reports/alerts persisted; geofence HIT/MISS verified |
| Weather (Open-Meteo) | ✅ Live |
| Gemini report generation | ✅ Live (`gemini-3.8-flash`; rule-based fallback still covers 5xx spikes) |
| Dashboard UI refresh (full-width shell + Outfit) | ✅ Done — 21 Oct 2026 |
| Deployed | ⛔ Not requested |

---

## 2. Environment variables

Managed by the **Neon CLI** (`neon deploy` pulls them into `.env.local`):

| Key | Source | What it does |
| --- | --- | --- |
| `DATABASE_URL` | `neon init` / `neon deploy` | **Pooled** Neon connection string — used by the app runtime (`@neondatabase/serverless` HTTP driver). |
| `DATABASE_URL_UNPOOLED` | `neon init` / `neon deploy` | **Direct** connection string — used by `drizzle.config.ts` for schema migrations (Neon best practice: never migrate over PgBouncer). |
| `NEON_BRANCH` | `neon init` / `neon deploy` | Pinned branch context (`production`). |
| `GEMINI_API_KEY` | Set in `.env.local` | Enables Gemini advisories (`gemini-3.8-flash`). Rule-based fallback covers API outages. |
| `GEMINI_MODEL` | Optional | Overrides the model (default `gemini-3.8-flash`). |
| `CRON_SECRET` | Optional | Protects `/api/cron/weekly-report` (unset → open). |

`neon.ts` (created by `neon init`) declares the branch policy; `neon deploy`
applies it. Neon agent skills are installed in `.agents/skills/` for reference.

---

## 3. Phase-by-phase status

### Phase 1 — Project init, Neon DB & schema ✅

- Next.js 16 (App Router, TypeScript, Tailwind v4) with `cacheComponents` +
  `partialPrefetching` enabled.
- Dependencies installed: `@neondatabase/serverless`, `drizzle-orm`,
  `drizzle-kit`, `leaflet`, `react-leaflet`, `@google/generative-ai`,
  `lucide-react`, `@types/leaflet`.
- `.env.local` + committed `.env.example`.
- `src/db/schema.ts` (5 tables) and `src/db/index.ts` (lazy `getDb()`).
- `drizzle.config.ts` with a small loader for `.env.local` (drizzle-kit does not
  read it by default). Migrations prefer `DATABASE_URL_UNPOOLED` (direct) per
  Neon best practice; the app runtime uses the pooled `DATABASE_URL`.
- Migration generated: `drizzle/0000_watery_joshua_kane.sql`.
- ✅ `npm run db:push` executed — schema applied to Neon branch `production`
  (`br-winter-bird-az06eau2`, project `young-fog-71814202`).

### Phase 2 — Satellite farmland selector ✅

- `MapDrawer` (dynamically imported with `ssr: false`) on Esri World Imagery
  tiles.
- Click ≥3 points to draw the polygon; live outline + auto area (acres) and
  centroid preview.
- Saves the expected schema — `geometry` as `[lat, lng][]`, computed centroid
  and area — via `POST /api/farms`.

### Phase 3 — Weather forecast engine ✅

- `src/lib/weather.ts` queries Open-Meteo (daily max/min temp, precipitation
  sum, rain probability, max wind, hourly surface soil moisture) and derives
  farmer-friendly warnings (heavy rain, heat, strong wind). **Verified live.**
- `WeatherCard` shows today's conditions, soil moisture, and a 7-day forecast.

### Phase 4 — Crop selection & weekly AI advisory ✅ (live with Gemini 3.8)

- `crops` POST + `weekly-report` POST both implemented; a crop can be linked to
  a farm, with age and growth stage computed.
- `POST /api/cron/weekly-report` computes crop age, fetches a 7-day forecast,
  builds the Gemini 4-bullet prompt (irrigation, fertilizer/spray timing,
  pest/disease watch, next step), stores the result in `weekly_reports`, and
  also exposes a `GET` for Vercel Cron.
- **Default model updated to `gemini-3.8-flash`** — Google deprecated
  `gemini-2.5-flash` for new API keys (404). Verified live end-to-end.
- **"Generate this week's report now"** button wired on the dashboard and crops
  page for instant demo use.
- `src/lib/gemini.ts` transparently falls back to a deterministic rule-based
  plan when `GEMINI_API_KEY` is empty or the API call fails (e.g. brief
  `503 high-demand` spikes), so the feature is demoable out of the box.

### Phase 5 — Predator & wildlife intrusion alerts ✅

- `POST /api/alerts/check` accepts `{ animalType, lat, lng, source }`, runs the
  Haversine radius query (`findFarmsWithinRadius`, 3 km) and records alerts with
  distance + compass direction.
- `/simulate` shows the satellite map; clicking spawns an animal marker
  (Elephant / Wild Boar / Tiger / Leopard / Forest Fire) and calls the API.
- On a hit: an `AudioContext` oscillator siren, a red flashing `AlertBanner`,
  and a browser `Notification` with distance and direction.

---

## 4. Verification performed

```
npx tsc --noEmit   → 0 errors
npm run lint       → 0 errors, 0 warnings
npm run build      → compiled + 14/15 static pages generated
```

### Neon e2e (production build, `next start -p 3111`, 21 Oct 2026)

Schema push (`npm run db:push` over the direct connection):

```
CREATE TABLE "crops" / "farmers" / "farmlands" / "intrusion_alerts" / "weekly_reports"
+ 3 FK constraints          →  [✓] Changes applied
```

Request chain against Neon branch `production`:

| Request | Result |
| --- | --- |
| `GET /` , `/map`, `/crops`, `/simulate` | `200` |
| `POST /api/farms` | `201` — farm `id 1` "Demo North Paddy Field", centroid `26.8500,80.9500`, 545.18 acres |
| `GET /api/farms` | `200` — 1 farm (persisted read-back) |
| `POST /api/crops` | `201` — crop `id 1`, "Paddy (Rice)" linked to farm 1, age 20 days |
| `POST /api/cron/weekly-report` | `201` — 1 report: Open-Meteo live fetch + Gemini `gemini-3.8-flash` plan, saved in `weekly_reports` |
| `GET /api/reports` | `200` — 3 reports (incl. fallback runs during Gemini 503 spike) |
| `POST /api/alerts/check` @ 0.07 km | `201` — `atRisk: true`, 0.07 km **NE**, alert row saved |
| `POST /api/alerts/check` @ Delhi (~400 km) | `201` — `atRisk: false`, 0 affected (geofence correct) |
| `GET /api/alerts` | `200` — 2 alerts stored (`NASA_FIRMS`, `COMMUNITY_SIGHTING`) |
| `GET /api/weather` (lat/lng and `farmId=1`) | `200` — live Open-Meteo; warnings: "Soil is dry" |

Incidents handled during the test (no code regression, no data loss):

- Gemini `503 high demand` → deterministic fallback advisory with an explanatory
  note (by design). Later retry returned a real `gemini` plan.
- Open-Meteo connect timeout → fixed to surface as `502 WEATHER_UPSTREAM`
  instead of a raw 500 (`src/lib/weather.ts`).

---

## 5. How to run

```bash
# 1. Install (already done)
npm install

# 2. Configure (already done — .env.local holds the Neon + Gemini variables;
#    `neon deploy` refreshes them from branch production)
neon deploy

# 3. Schema is already applied to Neon. Re-apply after schema changes:
npm run db:push

# 4. Develop
npm run dev          # http://localhost:3000
```

Quality gates:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # production build
```

Database helpers:

```bash
npm run db:generate  # regenerate SQL from src/db/schema.ts
npm run db:push      # apply schema to Neon (uses DIRECT connection)
npm run db:studio    # Drizzle Studio
```

Neon helpers:

```bash
neon status          # live branch/compute state
neon psql            # psql shell on branch production
neon open            # open the project in the Neon Console
```

---

## 6. Known limitations / notes

- **Local notifications only** — no service worker or VAPID keys, so alerts fire
  while the tab is open. Fine for the MVP demo.
- **Neon driver** (`@neondatabase/serverless`) was chosen per the docs; Drizzle is
  configured with `drizzle-orm/neon-http`.
- **`cacheComponents` is enabled**, so GET route handlers that touch the DB or
  network are dynamic on purpose. Do **not** add `dynamic` / `revalidate` /
  `fetchConfig` route configs — they are rejected in this mode.
- The client reads data through `/api/*` and avoids `new Date()` /
  `Math.random()` during render (client-only values use
  `useSyncExternalStore` via `useClientValue`).
- Gemini output is stored as Markdown and rendered with a small dependency-free
  renderer (`MarkdownLite`).

---

## 7. Next steps

1. ~~Add `DATABASE_URL` and push the schema~~ — done: Neon project linked,
   env vars pulled via `neon init`/`neon deploy`, schema applied on branch
   `production`, full e2e verified.
2. Optional: set `CRON_SECRET` and schedule `/api/cron/weekly-report` weekly.
3. Optional: deploy to Vercel and add the same env vars (Neon pooled URL, use
   `attachDatabasePool` guidance in the Neon skills for Vercel Fluid compute).

---

## 8. UI refresh — dashboard polish (21 Oct 2026)

Follow-up pass on the dashboard experience, applied on top of the finished
MVP:

**Typography**

- `Outfit` (via `next/font/google`, variable `--font-outfit`) replaces Geist
  Sans as the app face in `src/app/layout.tsx`; Geist Mono is kept for
  `code`. `globals.css` maps `--font-sans` to Outfit, tightens heading
  tracking (`-0.02em`) and balances heading line breaks.

**Full-width shell**

- `(dashboard)/layout.tsx` no longer centres content in a `max-w-6xl` column —
  the dashboard now spans the viewport, keeping only a slim 16 px (mobile) /
  24 px (sm+) gutter on **all** sides (`px-4 pt-4 pb-4 sm:px-6 sm:pt-4`).
- Map / Crops / Alerts pages keep their centred `max-w-6xl` column; the
  padding moved from the layout into each view (`MapView`, `CropsView`,
  `SimulateView`) so the two shells can evolve independently.
- The top nav (`AppNav`) was expanded to full width (`h-16`, rounded link
  pills) so its edges align with the dashboard gutter.

**Dashboard layout** (`DashboardView`)

- New page header: farm name + field count + total acres + weather update
  time, an alert-count chip when sightings are nearby, and a "Manage fields"
  shortcut.
- Satellite panel is taller and sticky (`lg:top-20`,
  `lg:h-[calc(100dvh-6rem)]`) and the left/right split was rebalanced to
  `1.12fr / 1fr`.
- The weekly advisory now renders inside the guide card via a new
  `embedded` prop on `ReportCard` (no nested card chrome, hidden icon).
- `FarmMap` gained a `className` passthrough, icon-only map controls below
  `sm` (labels return at `sm+`), a fixed-width farm selector
  (`w-56! min-h-9!` — the unlayered `.select` rule was overriding `w-56`)
  and no Leaflet zoom control (scroll/pinch zoom remains).

**Weather card**

- Stat grid switches to 4-up at `xl` and the 7-day strip to 7-up at `2xl`
  (previously `lg`), so temperatures stop wrapping at 1440 px; labels are
  uppercase micro-labels, values use tabular numerals, the "Now" tile got a
  soft highlight, and the rain emoji became a `Droplets` icon.

**Global polish** (`globals.css`)

- Themed text selection, caret colour and thin scrollbars; a
  `prefers-reduced-motion` guard disables the siren/rise/pulse animations.

**Verification**

```
npx tsc --noEmit   → 0 errors
npm run lint       → 0 errors, 0 warnings
npm run build      → compiled + 14/15 static pages generated
```

Plus headless-Chrome screenshots at 1440 px and 500 px against the
production build (`next start`) with live Neon/Open-Meteo data.

---

## 9. Accounts, onboarding, crop-day guide & pest siren (22 Oct 2026)

**Auth (name + PIN)**
- `farmers` now stores a salted **scrypt** PIN digest (`pin_hash`), keeps
  `phone` optional, and enforces a unique `name`. Existing legacy farms owned by
  the PIN-less "Demo Farmer" are claimable during onboarding.
- Signed, `httpOnly` session cookie (`agroai_session`, 30 days) created with
  HMAC-SHA256 via `AUTH_SECRET`. `AUTH_COOKIE_SECURE=false` is available only
  for local `next start` smoke tests over http.
- New routes: `POST /api/auth/register`, `POST /api/auth/login`,
  `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/farms/available`.

**Onboarding**
- `/onboarding` is a 4-step wizard: name ? select/draw farm ? crop + crop day +
  duration ? PIN. The PIN is suggested as `name1234` (editable) and login is
  always name + PIN.
- `/login` signs in and `/` is wrapped in an `AuthGate`; the dashboard nav shows
  the farmer's name and a **Sign out** button.
- Every data route is now scoped to the session: farms, crops, reports, weather
  and the weekly-report generator only touch the signed-in farmer's rows.
  Unauthenticated API requests receive `401 AUTH_REQUIRED`.

**No fabricated data**
- Removed the auto-created demo farmer path and all global (cross-account) farm,
  crop and report queries used by the UI. Weather remains live Open-Meteo.
- Crop-day guidance is deterministic from the farmer's own crop, crop day and
  duration (`src/lib/crop-guide.ts`).

**Crop-day guide**
- `crops.duration_days` added. The dashboard shows the current stage, progress,
  day of cycle, tasks, watch-outs and next-stage date.

**Pest siren**
- `src/lib/pest-risk.ts` scores pest pressure from crop stage + live forecast
  (3-day rain chance/total, wet days, temperature, wind, soil moisture) and
  returns threats, reasons and a scout plan.
- `GET /api/pest-risk` exposes it per crop. The dashboard `PestSirenCard` can arm
  a Web Audio siren + browser notification for **high/critical** risk.

**Verification**
- `npx tsc --noEmit` ? 0 errors
- `npm run lint` ? 0 errors / 0 warnings
- `npm run build` ? succeeds (22 routes, auth APIs dynamic)
- Live e2e against Neon: claim legacy farm ? register ? `me`/farms/crops scoped ?
  Open-Meteo weather ? pest risk (moderate) ? Gemini report (live) ? logout 401 ?
  wrong PIN 401 ? correct login 200. Test rows were removed afterwards.
