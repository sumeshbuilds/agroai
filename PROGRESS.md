# AgroAI — Implementation Progress Report

_Last updated: 16 October 2026_

This document tracks progress against the four root spec files:
[`README.md`](./README.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md),
[`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) and
[`OPENCODE_TASKS.md`](./OPENCODE_TASKS.md).

---

## 1. Summary

| Item | Status |
| --- | --- |
| Code complete (all 5 phases) | ✅ Done |
| `npx tsc --noEmit` | ✅ Clean (0 errors) |
| `npm run lint` | ✅ Clean (0 errors, 0 warnings) |
| `npm run build` | ✅ Succeeds (Turbopack, Next.js 16.4.2) |
| Runtime smoke test | ✅ Pages 200, weather live, DB-less requests degrade gracefully |
| Database schema pushed to Neon | ⛔ Blocked — needs `DATABASE_URL` |
| Gemini report generation | ⚠️ Code complete; rule-based fallback runs until `GEMINI_API_KEY` is set |
| Deployed | ⛔ Not requested |

**Everything is implemented and verified locally. The only remaining steps are
providing the two environment variables and pushing the schema.**

---

## 2. Environment variables required

Create `.env.local` (copy from `.env.example`):

| Key | Required? | Where to get it | What breaks without it |
| --- | --- | --- | --- |
| `DATABASE_URL` | **Yes** | Neon console → Project → **Connection string** (use the **pooled** string, which contains `-pooler`) | Farms, crops, alerts and reports cannot be saved — the UI shows a setup notice and API routes return `503 DB_NOT_CONFIGURED`. |
| `GEMINI_API_KEY` | Optional | Google AI Studio → API key | Reports still generate, but from the built-in rule-based fallback instead of Gemini. |
| `GEMINI_MODEL` | Optional | — | Defaults to `gemini-2.5-flash`. |
| `CRON_SECRET` | Optional | Any random string | `/api/cron/weekly-report` is unprotected. |

`.env.local`:

```dotenv
DATABASE_URL=postgresql://<user>:<password>@<host>-pooler.<region>.aws.neon.tech/<db>?sslmode=require
GEMINI_API_KEY=
```

> Weather (Open-Meteo) and satellite imagery (Esri World Imagery) need **no keys**.

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
  read it by default).
- Migration generated: `drizzle/0000_watery_joshua_kane.sql`.
- ⛔ `npm run db:push` not yet run — waiting on `DATABASE_URL`.

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

### Phase 4 — Crop selection & weekly AI advisory ✅ (fallback until key set)

- `crops` POST + `weekly-report` POST both implemented; a crop can be linked to
  a farm, with age and growth stage computed.
- `POST /api/cron/weekly-report` computes crop age, fetches a 7-day forecast,
  builds the Gemini 4-bullet prompt (irrigation, fertilizer/spray timing,
  pest/disease watch, next step), stores the result in `weekly_reports`, and
  also exposes a `GET` for Vercel Cron.
- **"Generate this week's report now"** button wired on the dashboard and crops
  page for instant demo use.
- `src/lib/gemini.ts` transparently falls back to a deterministic rule-based
  plan when `GEMINI_API_KEY` is empty or the API call fails, so the feature is
  demoable out of the box.

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
npm run build      → compiled + 15/15 static pages generated
```

Runtime smoke test (`next start`, port 3111, no `DATABASE_URL`):

| Request | Result |
| --- | --- |
| `GET /`, `/map`, `/crops`, `/simulate` | `200` |
| `GET /manifest.webmanifest` | `200` |
| `GET /api/weather?lat=26.85&lng=80.95` | `200` — live Open-Meteo data returned |
| `GET /api/farms`, `/api/crops`, `/api/reports` | `503` `DB_NOT_CONFIGURED` (expected, handled by UI) |
| `POST /api/alerts/check` | `503` `DB_NOT_CONFIGURED` (expected) |

---

## 5. How to run

```bash
# 1. Install (already done)
npm install

# 2. Configure
copy .env.example .env.local   # then paste your Neon DATABASE_URL + optional GEMINI_API_KEY

# 3. Push the schema to Neon
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
npm run db:push      # apply schema to Neon
npm run db:studio    # Drizzle Studio
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

1. Add `DATABASE_URL` (Neon pooled string) to `.env.local` and run `npm run db:push`.
2. Add `GEMINI_API_KEY` to switch the advisory from the fallback to Gemini.
3. Optional: set `CRON_SECRET` and schedule `/api/cron/weekly-report` weekly.
4. Optional: deploy to Vercel and add the same env vars.
