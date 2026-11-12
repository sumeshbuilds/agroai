# AgroAI — Implementation Progress Report

_Last updated: 27 October 2026_

This document tracks progress against the root spec files:
[`README.md`](./README.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md),
[`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md), [`LIVE_CAMERA.md`](./LIVE_CAMERA.md)
and [`OPENCODE_TASKS.md`](./OPENCODE_TASKS.md).

---

## 1. Summary

| Item | Status |
| --- | --- |
| Code complete (phases 1–4 + live camera rework; phase 5 removed) | ✅ Done |
| Neon project linked (`neon init` → project `young-fog-71814202`, branch `production`) | ✅ Done |
| Database schema pushed to Neon (`npm run db:push`) | ✅ Done — 7 tables + FKs (`camera_alerts` added, `intrusion_alerts` dropped) |
| `npx tsc --noEmit` | ✅ Clean (0 errors) |
| `npm run build` | ✅ Succeeds (Turbopack, Next.js 16.4.2, 24 routes) |
| Runtime e2e against Neon | ✅ Farms/crops/reports persisted; camera pairing → frame ingest → confirmed-track alarms verified |
| Weather (Open-Meteo) | ✅ Live — field centroid **and** phone GPS |
| Gemini report generation | ✅ Live (`gemini-3.8-flash`; rule-based fallback still covers 5xx spikes) |
| Live field camera (phone → laptop) | ✅ Done — on-device COCO-SSD, human/animal-only tracking, QR pairing |
| Human/animal alarms | ✅ Done — confirmed tracks raise dashboard alarms (siren + notification) |
| Groq vision verifier | ⚙️ Wired — activates when `GROQ_API_KEY` is set (untested without a key) |
| Fake alert simulator | ✅ Removed (`/simulate`, `/api/alerts*`, `intrusion_alerts`) — 26–27 Oct 2026 |
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
| `GROQ_API_KEY` | Optional | Enables the server-side Groq vision verifier for new human/animal tracks. Empty → verification skipped silently. |
| `GROQ_VISION_MODEL` | Optional | Overrides the verifier model (default `qwen/qwen3.8-27b`). |
| `GROQ_TIMEOUT_MS` | Optional | Verifier request timeout in ms (default `4500`, clamped 1000–15000). |
| `GROQ_BASE_URL` | Optional | Overrides the OpenAI-compatible endpoint (default `https://api.groq.com/openai/v1/chat/completions`). |
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
- `src/db/schema.ts` (now 7 tables: farmers, farmlands, crops, camera_sessions,
  camera_detections, camera_alerts, weekly_reports) and `src/db/index.ts` (lazy
  `getDb()`).
- `drizzle.config.ts` with a small loader for `.env.local` (drizzle-kit does not
  read it by default). Migrations prefer `DATABASE_URL_UNPOOLED` (direct) per
  Neon best practice; the app runtime uses the pooled `DATABASE_URL`.
- Migrations generated: `drizzle/0000_watery_joshua_kane.sql`,
  `0001_happy_nextwave.sql`, `0002_live_camera_tables.sql`,
  `0003_remove_simulated_alerts.sql`, `0004_first_wolfsbane.sql`.
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

### Phase 5 — Predator & wildlife intrusion alerts 🗑️ REMOVED (26 Oct 2026)

> **This phase was deleted.** It was a demo-only simulator (map click → fake
> sighting). It has been replaced by the real camera pipeline in
> [section 10](#10-live-field-camera-and-satelliteweather-polish-oct-2026).
> The text below is kept only as history.

- `POST /api/alerts/check` accepts `{ animalType, lat, lng, source }`, runs the
  Haversine radius query (`findFarmsWithinRadius`, 3 km) and records alerts with
  distance + compass direction.
- `/simulate` shows the satellite map; clicking spawns an animal marker
  (Elephant / Wild Boar / Tiger / Leopard / Forest Fire) and calls the API.
- On a hit: an `AudioContext` oscillator siren, a red flashing `AlertBanner`,
  and a browser `Notification` with distance and direction.

Removed in the rework: `/simulate`, `SimulateView`, `SimulatorMap`,
`AlertBanner`, `/api/alerts`, `/api/alerts/check`, `listAlerts`,
`createIntrusionAlert`, `findFarmsWithinRadius`, the `ANIMAL_KINDS` catalog and
the `intrusion_alerts` table.

---

## 4. Verification performed

```
npx tsc --noEmit   → 0 errors
npm run lint       → 0 errors, 0 warnings
npm run build      → compiled + 14/15 static pages generated
```

### Neon e2e (production build, `next start -p 3111`, 21 Oct 2026)

> Historical record from the original build. The `/simulate` page and
> `/api/alerts*` routes listed below have since been removed; see
> [section 10](#10-live-field-camera-and-satelliteweather-polish-oct-2026) for
> the current camera e2e run.

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

Phone camera demo (two devices on the same network):

```text
Laptop:  http://localhost:3000/watch  → sign in → "Pair a phone"
Phone:   scan the QR → allow camera + location → "Start camera stream"
```

Phone browsers only expose the camera over **HTTPS** (or `localhost`). For a LAN
demo either run `npm run dev:https`, open an HTTPS tunnel
(`cloudflared tunnel --url http://localhost:3000`), deploy, or use the Android
Chrome insecure-origin flag — see [`LIVE_CAMERA.md`](./LIVE_CAMERA.md).

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

- **Local notifications only** — no service worker or VAPID keys, so pest-risk
  notifications fire while the tab is open. Fine for the MVP demo.
- **Camera page needs a secure context** — phone browsers only expose
  `getUserMedia` on HTTPS or `localhost`. Local LAN demos need a tunnel,
  `npm run dev:https`, a deployment, or the Android Chrome insecure-origin flag
  (details in [`LIVE_CAMERA.md`](./LIVE_CAMERA.md)).
- **Live camera transport is snapshot-based** — JPEG frames every 0.7–2.6 s
  (adaptive) polled by the dashboard, so glass-to-glass latency is ~1.5–2.5 s.
  No WebRTC signalling server and no video storage; only the newest frame per
  session is kept.
- **Tracking is human/animal-only, on purpose** — vehicles, furniture and generic
  "movement" are filtered out before logging, so the feed and alarms stay
  meaningful. COCO-SSD still supplies the animal classes (cow, dog, cat, horse,
  sheep, bird, elephant, bear, zebra, giraffe); tiger / leopard / wild boar are
  recognised through the optional Groq verifier or a future custom model.
- **Groq verification is optional and event-driven** — only *new confirmed
  tracks* are sent (one small JPEG per track, never a video stream), and it runs
  after the ingest response via `after()`, so a slow model can never delay a
  frame. Without `GROQ_API_KEY` the on-device labels stand as-is.
- **Alarms are local to the open tab** — the dashboard polls `/api/camera/alerts`
  (4 s on `/watch`, 6 s on the dashboard) and shows a banner; the siren and
  browser notification require the user to arm them once per browser.
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
2. ~~Replace the fake intrusion simulator~~ — done: real phone-camera tracking in
   [section 10](#10-live-field-camera-and-satelliteweather-polish-oct-2026).
3. **Before the science exhibition:** serve the phone page over HTTPS (deploy to
   Vercel or run `cloudflared tunnel --url http://localhost:3000`) so
   `getUserMedia` works on a real phone — see
   [`LIVE_CAMERA.md`](./LIVE_CAMERA.md).
4. Optional: add `GROQ_API_KEY` to `.env.local` to switch on AI species
   verification (no key → on-device labels only, nothing breaks).
5. Optional: set `CRON_SECRET` and schedule `/api/cron/weekly-report` weekly.
6. Optional: deploy to Vercel and add the same env vars (Neon pooled URL, use
   `attachDatabasePool` guidance in the Neon skills for Vercel Fluid compute).
7. Optional stretch: train a small custom detector for wild boar / tiger /
   leopard so the demo recognises local species instead of generic COCO labels.

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
- Map / Crops / Watch pages keep their centred `max-w-6xl` column; the
  padding moved from the layout into each view (`MapView`, `CropsView`,
  `WatchView`) so the two shells can evolve independently.
- The top nav (`AppNav`) was expanded to full width (`h-16`, rounded link
  pills) so its edges align with the dashboard gutter.

**Dashboard layout** (`DashboardView`)

- New page header: farm name + field count + total acres + weather update
  time, an alert-count chip when sightings are nearby (replaced by the
  live-camera chip in section 10), and a "Manage fields" shortcut.
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
- `/onboarding` is a 4-step wizard: name → select/draw farm → crop + crop day +
  duration → PIN. The PIN is suggested as `name1234` (editable) and login is
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
- `npx tsc --noEmit` → 0 errors
- `npm run lint` → 0 errors / 0 warnings
- `npm run build` → succeeds (22 routes, auth APIs dynamic)
- Live e2e against Neon: claim legacy farm → register → `me`/farms/crops scoped →
  Open-Meteo weather → pest risk (moderate) → Gemini report (live) → logout 401 →
  wrong PIN 401 → correct login 200. Test rows were removed afterwards.

---

## 10. Live field camera and satellite/weather polish (Oct 2026)

_Implemented 26–27 October 2026._

**Fake alarm system removed**

- Deleted `/simulate`, `SimulateView`, `SimulatorMap`, `AlertBanner`, the
  `/api/alerts` + `/api/alerts/check` routes, the `intrusion_alerts` schema and
  all simulated-sighting queries. Migration `0003_remove_simulated_alerts.sql`
  drops the old table. No alert in the app is synthetic any more.

**Phone camera (`/camera?token=…`, standalone, no login)**

- Random token pairing created from `/watch`; token is scoped to one farmer and
  one session.
- `getUserMedia` rear camera with flip, torch (when supported), screen wake lock
  and optional GPS.
- **On-device COCO-SSD** via TensorFlow.js WebGL (`tfjs-core`,
  `tfjs-converter`, `tfjs-backend-webgl`, `@tensorflow-models/coco-ssd`), plus a
  frame-differencing motion fallback so the demo keeps working while the ~6 MB
  model downloads or if WebGL is unavailable.
- IoU tracker gives stable track ids, confidence, path, direction and speed.
- Uploads a ≤560 px JPEG (~30–60 KB) every 800 ms with normalised boxes + GPS.
  Raw video never leaves the phone.
- Secure-context detection with explicit HTTPS / Android-flag / `dev:https`
  instructions; `npm run dev:https` script added.

**Laptop live watch (`/watch`, auth-gated)**

- QR pairing card built with `react-qr-code`; LAN IP resolved server-side
  (`/api/camera/network`) so `localhost` is replaced with a phone-reachable URL.
- Near-live player: versioned JPEG frame + moving boxes + SVG movement trails +
  live/offline state, frame-age badge, scanline.
- Detection feed (one row per new track) with category chips; people, animals,
  vehicles and motion stats; AI/motion mode badge.
- Field context: nearest satellite-mapped farm + distance/compass direction, GPS,
  live Open-Meteo weather at the camera location.
- Stop / restart / delete session. Restarting lets the phone pair again.

**Satellite + area**

- Map page now shows total mapped land in **acres + ha + m²**, field parcels, live
  camera count, hectares on the drawing chip, and live camera markers on the
  satellite map.
- Dashboard map receives live camera markers; `LiveWatchCard` replaces the old
  alert banner and shows the newest frame + current people/animals counts.

**Database**

- New tables `camera_sessions` (latest frame, overlay detections, motion, GPS,
  pairing token) and `camera_detections` (one row per new track with box,
  confidence, direction, speed, GPS).
- Migrations `0002_live_camera_tables.sql` + `0003_remove_simulated_alerts.sql`
  generated and applied to Neon branch `production`; `npm run db:push` now
  reports “No changes detected”.

**Verification**

```
npx tsc --noEmit   → 0 errors
npm run lint       → 0 errors, 0 warnings
npm run build      → succeeds (23 routes)
```

Live API e2e (production server, Neon):

| Check | Result |
| --- | --- |
| register + signed session cookie | 201 |
| camera sessions require auth | 401 |
| LAN network address endpoint | 200 (`10.16.169.125`) |
| create pairing session | 201, random token |
| token pairing lookup | 200 (waiting) |
| ingest JPEG frame + person detection | 200, detection logged |
| session detail / live state / frame dimensions | 200, live, 1280×720 |
| stored JPEG frame endpoint | 200, `image/jpeg`, 517 bytes |
| duplicate track in next frame | not duplicated in feed |
| second track (elephant) | logged, label/emoji enriched |
| weather by camera GPS | 200, live Open-Meteo |
| stop session → token ingest | 409 `STREAM_STOPPED` |
| restart → list → delete | 200 / 200 / 200 |

Headless-Chrome test with a real browser page: `/camera` pair link renders,
**Start camera stream** acquired a fake media stream, COCO-SSD loaded
(`aiEnabled: true`) and frames reached `/watch` (`isLive: true`, frame age 2 s,
`connected` chip). Screenshots reviewed at 1440 px and 430 px. Test farmer /
farm / camera rows removed afterwards.

**Polish pass (27 Oct 2026)**

- Camera start now waits for real `videoWidth`/`videoHeight` (up to 3.5 s) and
  aborts with a clear message instead of uploading 2×2 placeholder JPEGs.
- Detection, motion sampling and upload all skip frames below 32 px.
- Idle state uses a 3:4 placeholder so “Start camera stream” is reachable
  without a video stream; elapsed timer resets on every (re)start.
- `getCapabilities()` is guarded — iOS/Safari no longer throws on torch check.
- Flip camera releases the old GPS watch and wake lock before re-opening.
- Upload errors surface on the phone; `404` (deleted session) and
  `STREAM_STOPPED` (laptop stop) both stop the camera cleanly.
- Dashboard card + watch header distinguish `LIVE` / `No frames` / `Waiting` /
  `Ended` instead of a bare status word.
- QR code enlarged to 168 px; watch page “Refresh” forces both session list and
  detail without clearing the player.
- `/map` re-polls camera sessions every 5 s so live markers appear without a
  reload; stray `.tmp-*` test scripts and leftover empty `simulate/` dir removed.
- Docs updated: `README.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`,
  `LIVE_CAMERA.md` (new), this file, plus `layout.tsx` / `manifest.ts`
  descriptions.

**Files added / changed**

| Area | Files |
| --- | --- |
| Shared types | `src/lib/camera.ts` (classes, categories, enrichment, DTOs) |
| Server queries | `src/lib/camera-queries.ts` (sessions, ingest, dedupe, stop/delete) |
| APIs | `src/app/api/camera/sessions/route.ts`, `sessions/[id]/route.ts`, `sessions/[id]/frame/route.ts`, `stream/[token]/route.ts`, `network/route.ts` |
| Phone page | `src/app/camera/page.tsx`, `src/components/camera/CameraStreamView.tsx` |
| Laptop page | `src/app/(dashboard)/watch/page.tsx`, `src/components/watch/WatchView.tsx`, `LiveWatchCard.tsx` |
| Navigation / map | `AppNav.tsx`, `FarmMap.tsx`, `MapDrawer.tsx`, `MapView.tsx`, `src/lib/map.ts` |
| Data | `src/db/schema.ts`, `src/lib/queries.ts`, `src/lib/types.ts`, `src/lib/api-client.ts`, `drizzle/0002_*.sql`, `drizzle/0003_*.sql` |
| Removed | `app/(dashboard)/simulate/`, `components/simulate/`, `components/map/SimulatorMap.tsx`, `components/alerts/AlertBanner.tsx`, `app/api/alerts/` |
| Docs | `README.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `LIVE_CAMERA.md`, `PROGRESS.md` |

**Repo state:** the original camera work is committed as `0cc79b1` (“two”); the
human/animal-only rework, alarms and Groq verifier are in the working tree (see
section 11). `npm run db:push` reports no pending schema changes, so the working
tree matches Neon branch `production`.

**Current limitation:** the live transport is JPEG snapshots (not WebRTC), now
0.7–5 s apart depending on link quality, so latency is ~1.5–2.5 s. That is
deliberate: it needs no signalling server, works over a phone hotspot, and keeps
the Neon/free tier and mobile data use low. Also: phone camera access requires
HTTPS (or `localhost`) — see [`LIVE_CAMERA.md`](./LIVE_CAMERA.md) for the tunnel /
`dev:https` / Android-flag options.

---

## 11. Human/animal-only tracker, alarms & Groq verifier (27 Oct 2026)

_Follow-up to section 10._ Goal: stop the feed from flagging parked motorcycles
and random movement, make tracks trustworthy, and turn a **confirmed** human or
animal into a real dashboard alarm — while staying usable on weak mobile data.

**1. Only humans and animals are tracked**

- `src/lib/camera.ts` now has a `TRACKABLE_LABELS` catalog (person + ~45 farm and
  wildlife species), `TRACKABLE_CLASSES`, `isTrackableClass()` and
  `isTrackedCategory()`. Vehicles, furniture and the old frame-difference
  "Movement" box are **never** emitted or stored any more.
- `DetectionCategory` keeps `motion` / `vehicle` / `other` only so historical rows
  still render; the live pipeline writes `person` and `animal` exclusively.
- Legacy labels (`car`, `motion`, …) moved to a separate `LEGACY_LABELS` map used
  for old rows.
- The watch page and dashboard filter overlays/feed to person + animal.

**2. Faster, smoother live feed**

- Inference runs on a **416 px** copy of the video instead of the full frame, so
  WebGL COCO-SSD on a phone roughly halves its per-frame cost.
- Adaptive loops: detect every 350 ms when movement is present, 950 ms when idle,
  2.5 s when the tab is hidden; `/watch` polling slows automatically on 2G or
  data-saver connections.
- Tracker smoothing (NMS + box easing, `TRACK_MEMORY_MS = 1600` coasting) keeps
  boxes from flickering or teleporting.

**3. Temporal confirmation**

- A track is only logged once it is seen `TRACK_CONFIRM_HITS = 3` times at
  `TRACK_CONFIRM_CONFIDENCE = 0.42`, or twice at ≥ 0.82. One blurry frame can no
  longer create an event.
- Track ids include a per-run random suffix (`p1-abc12`) so a phone reload is not
  swallowed by the 15-minute dedupe window.

**4. Alarms on the dashboard**

- New `camera_alerts` table (migration `0004_first_wolfsbane.sql`), one row per
  confirmed track, with `message`, `emoji`, `category`, `confidence`, `source`,
  `verified`, GPS and `acknowledged_at`.
- `camera_detections` gained `confirmed`, `source` (`on-device` | `groq`) and
  `verified`.
- Ingest creates the detection **and** the alarm in the same request; a per-camera
  **8 s cooldown** (evaluated with SQL `now()` so app/Neon clock skew cannot break
  it) prevents alarm storms, e.g. a flock of birds.
- New `GET` / `POST /api/camera/alerts` — list unread (`?all=1` for history) and
  acknowledge one or all.
- `CameraAlarmBanner` polls the alarm endpoint (4 s on `/watch`, 6 s on the
  dashboard), shows the newest event with an **AI-verified** badge, and can arm a
  Web Audio siren + browser notification. Armed state persists in `localStorage`;
  alarms that already existed before the page opened never fire the siren.

**5. Optional Groq vision verifier**

- `src/lib/groq.ts` sends **one** downscaled JPEG per *new confirmed track* to
  `qwen/qwen3.8-27b` (override with `GROQ_VISION_MODEL`) in JSON mode with a 4.5 s
  timeout (`GROQ_TIMEOUT_MS`).
- The route schedules it with Next.js `after()`, so verification never delays the
  frame response. A verdict can relabel the animal species, mark the row
  `verified`, or refute the track and retract the alarm.
- With no `GROQ_API_KEY` the call is skipped silently and the on-device label
  stands — the feature degrades instead of failing.

**6. Low-bandwidth transport**

- Uploads switched to `multipart/form-data` (raw JPEG blob) instead of a base64
  data URL, removing the ~33 % size overhead. The legacy JSON `{ frame }` path is
  still accepted.
- Cadence/size adapt to `navigator.connection`: active 700 ms / slow 1.4 s; idle
  2.6 s / slow 5–6.5 s; JPEG width 320–560 px, quality 0.5–0.65; `saveData`,
  `slow-2g` and `2g` are all treated as slow.
- Server cap on frame size is 650 KB and only the newest frame per session is
  stored.

**6a. Weak-link and sync hardening (12 Nov 2026)**

- Upload cadence now derives from the **measured** attempt (`uploadMs`, failures)
  as well as `navigator.connection`: failed attempts back off 2 → 4 → 8 → 16 →
  30 s and the next frame is sent only after roughly half the link's measured
  capacity has been used. A hung request is aborted after 14–25 s instead of
  20–30 s.
- The phone stops posting while `navigator.onLine` is false, keeps detection
  local, and resumes immediately on `online`. Confirmed event frames remain in
  the bounded buffer; a growing backlog also switches new event frames to the
  smaller/cheaper encode.
- `LIVE_WINDOW_MS` is 45 s, so a phone uploading every 20–30 s no longer flips
  between live/offline. The dashboard shows an explicit "Reconnecting…" state.
- `/watch` polling is adaptive: 1.5 s live / 4 s slow, exponential backoff on
  failures (3 → 6 → 12 → 15 s), 15 s when hidden, and metadata-only while the
  tab is hidden (no JPEG download). The cheap session-list poll backs off to
  30 s. The list/detail snapshots are timestamped so an external stop/restart is
  reflected even if the detail poll is stalled.
- Server ingest returns the updated session metadata from the same `UPDATE`
  round trip, removing a second query from every frame upload.
- Unit coverage lives in `tests/camera/link-adaptive.test.ts` (6 new tests).

**Verification**

```
npx tsc --noEmit   → 0 errors
npm run lint       → 0 errors, 0 warnings
npm run build      → succeeds (24 routes)
npm run db:push    → 0004 applied; re-run reports no changes
```

Live e2e (production build, `next start -p 3111`, Neon branch `production`):

| Check | Result |
| --- | --- |
| multipart ingest: 1 person + a `motion` + a `car` box | `200` — only **Person** logged, 1 alarm |
| same track re-sent 2 s later | `200` — 0 new detections, 0 alarms (15-min dedupe) |
| elephant inside the 8 s cooldown | `200` — logged, **0** alarms |
| unconfirmed cow (`confirmed:false`) | `200` — not logged, no alarm |
| wild boar after 9 s | `200` — logged as `animal`, 1 alarm |
| session detail / feed | only confirmed person/animal rows |
| `GET /api/camera/alerts` | `200` — `unread: 2` |
| `POST /api/camera/alerts { all: true }` | `200` — 2 acknowledged |
| `GET /api/camera/alerts` after ack / `?all=1` | `unread: 0` / history still returns 2 |
| stored frame, delete session, logout | `200` / `200` / `200` |

Test farmer, farm link, crop, session, detections and alarms were removed
afterwards; the pre-existing camera session and its 26 historical detections were
left untouched.

**Files added / changed**

| Area | Files |
| --- | --- |
| Shared types | `src/lib/camera.ts` (trackable catalog, confirmation, alarm copy, DTOs) |
| Groq client | `src/lib/groq.ts` (config, JSON-mode call, verdict parsing) |
| Server queries | `src/lib/camera-queries.ts` (confirmed-only ingest, dedupe, cooldown, alerts, verification apply) |
| APIs | `src/app/api/camera/stream/[token]/route.ts` (multipart + `after()`), `src/app/api/camera/alerts/route.ts` (new) |
| Phone | `src/components/camera/CameraStreamView.tsx` (416 px inference, adaptive loops, confirmation, multipart upload) |
| Dashboard | `src/components/watch/CameraAlarmBanner.tsx` (new), `src/lib/alarm.ts` (new), `WatchView.tsx`, `DashboardView.tsx` |
| Data | `src/db/schema.ts`, `src/lib/api-client.ts`, `drizzle/0004_first_wolfsbane.sql` |
| Config / docs | `.env.example`, `README.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `LIVE_CAMERA.md`, this file |

**Not yet verified:** the live Groq path (no `GROQ_API_KEY` supplied). The code
returns `null` on missing key, HTTP error or timeout, so ingest/alarms behave
exactly as tested above either way.

---

## 12. Plant doctor — photo disease detection (10 Nov 2026)

New `/detect` page for farmers: take a photo with the rear phone camera or
upload one, choose the crop (optional) and plant part, add an optional note, and
get an AI plant-health verdict with a practical action plan. The same scan can
also be opened from a crop's day card (`Scan a leaf`).

**Photo pipeline**

- Browser-side `prepareScanImage()` loads the photo, applies EXIF orientation,
  downscales the long edge to 1280 px, fills transparent PNGs on white and
  re-encodes JPEG (quality 0.86 → 0.64 until ≤ 1.4 MB). It also samples a 240 px
  grayscale copy and computes average brightness + Laplacian variance, so blurry,
  dark, overexposed and low-resolution photos get an inline warning before the
  AI call (the warning never blocks a deliberate "scan anyway").
- Upload is `multipart/form-data`; the server checks JPEG/PNG/WebP magic bytes,
  not just the declared MIME type, and rejects anything over 2.5 MB.
- The compressed JPEG is stored as base64 in `disease_scans` and served back
  through an auth-scoped `/api/disease/scans/:id/image` route with a private
  one-hour cache and `Vary: Cookie` (so switching accounts cannot reuse it).

**AI analysis**

- `src/lib/disease-ai.ts` sends the photo + crop/part/note to Gemini Vision
  (`gemini-3.8-flash`, JSON mode) with a 40 s timeout. The prompt asks the model
  to first judge subject and photo quality, then give a cautious diagnosis with
  visible symptoms, causes, immediate actions, organic and general chemical
  options, prevention, look-alikes, ranked differentials, spread risk, urgency
  and a monitoring date — never a pesticide dose.
- Crop context is attached from the farmer's own record: growth stage, day since
  sowing and the stage's known threats (`crop-guide.ts`), plus a best-effort
  3-day weather line from Open-Meteo (2.5 s timeout; dropped if slow).
- If Gemini fails and `GROQ_API_KEY` exists, the same photo goes to Groq's
  OpenAI-compatible vision endpoint (18 s timeout) as a fallback. When Gemini's
  read is uncertain, low-confidence or photo-limited, Groq also provides an
  independent second opinion (12 s cap). Agreement raises confidence;
  disagreement lowers it and adds the other diagnosis to the differential list.
  `DISEASE_SECOND_OPINION=false` disables the cross-check.
- With neither provider available, or when both fail, the route returns
  `502 DISEASE_AI_UNAVAILABLE`; **nothing is saved**. No fake diagnosis.
- Model replies are normalised (`86` confidence → `0.86`, common synonyms for
  health status/pathogen/severity/risk/urgency, arrays trimmed and de-duplicated).
  A non-plant subject can never keep a disease name, and a `diseased` reply below
  0.40 confidence is downgraded to `uncertain` with retake guidance.

**UI**

- `/detect` (`PlantDoctorView`, `DiseaseResultCard`, `DiseaseHistory`) follows
  the existing Field Ops design: dark 4:3 capture surface with a sweeping scan
  line, camera/upload actions, crop select from the farmer's own crops plus
  common presets, six plant-part pills, optional note with counter.
- The result card shows a coloured healthy/diseased/uncertain banner, confidence
  bar, pathogen/severity/urgency/spread/quality/part/source chips, scanned image,
  "what the scan shows", numbered "do this now" actions, organic and chemical
  blocks (with a safety note), ranked differential diagnoses with their own
  confidence bars, a monitoring reminder, prevention, look-alikes and the AI-check
  disclaimer. Low confidence (<45%) asks for a closer photo, and a one-tap
  "take a better photo" / "scan another plant part" path reopens the camera.
- A blurry/dark/low-resolution photo shows an inline quality warning and the
  button becomes "Scan this photo anyway"; the result card repeats the model's
  retake advice when the scan is photo-limited.
- Recent scans show private thumbnails, status dot, disease/crop/part,
  confidence, time, click-to-open and inline two-step delete.
- The rail/dock gained a fifth **Scan** item; the mobile dock stays 5-up with no
  horizontal overflow. Odia labels were added for the new UI strings.

**Database**

- `disease_scans` (migration `0005_greedy_thor_girl.sql`): farmer FK (cascade),
  optional crop FK (`set null`), crop/part/note, image MIME + base64, health
  status, disease/pathogen/severity, confidence, summary and seven JSON string
  arrays, source/model and timestamps. Indexes on `(farmer_id, created_at)` and
  `crop_id`. Migration `0006_disease_scan_context.sql` adds `subject`,
  `image_quality`, `retake_advice`, `spread_risk`, `urgency`, `differentials`
  (jsonb) and `monitoring`. Applied to the configured Neon database with
  `npm run db:push` (12 Nov 2026).

**Environment**

- `GEMINI_API_KEY` now also powers the plant doctor. Optional:
  `DISEASE_GEMINI_TIMEOUT_MS`, `GEMINI_BASE_URL`, `GROQ_DISEASE_MODEL`,
  `GROQ_DISEASE_TIMEOUT_MS`, `DISEASE_SECOND_OPINION=false`.

**Verification**

```
npx tsc --noEmit   → 0 errors
npm run lint       → 0 errors (2 pre-existing warnings: watch ref cleanup, i18n exact)
npm run build      → succeeds (28 routes; /detect + 4 disease APIs dynamic)
npm run db:push    → 0005 applied
```

- API e2e on the production build: register test farmer → create farm → upload a
  138 KB tomato late-blight leaf photo → `201` scan (`Late blight`, fungal, high,
  0.86) → list → image `200 image/jpeg` → delete `200` → test rows removed.
- UI e2e in headless Chromium at 1440 px and 430 px: upload → analyse → result
  card, history, no console errors, no horizontal overflow.
- **Network note:** this sandbox could not reach `generativelanguage.googleapis.com`
  (direct REST/SDK calls timed out), so the provider response was verified
  end-to-end against a local Gemini-format mock. The timeout above prevents the
  API hanging in this situation; on a normal network the same code path calls
  Gemini directly.

**Files added / changed**

| Area | Files |
| --- | --- |
| Page | `src/app/(dashboard)/detect/page.tsx` |
| UI | `src/components/disease/PlantDoctorView.tsx`, `DiseaseResultCard.tsx`, `DiseaseHistory.tsx` |
| APIs | `src/app/api/disease/detect/route.ts`, `src/app/api/disease/scans/route.ts`, `scans/[id]/route.ts`, `scans/[id]/image/route.ts` |
| AI / data | `src/lib/disease.ts`, `disease-ai.ts`, `disease-queries.ts`, `image.ts` |
| Data | `src/db/schema.ts`, `drizzle/0005_greedy_thor_girl.sql` |
| Client | `src/lib/api-client.ts`, `src/components/crops/CropsView.tsx` (scan link), `src/components/layout/AppNav.tsx` |
| i18n / style | `src/lib/i18n/dictionary/disease.ts`, dictionary index, `src/app/globals.css` |
| Docs / config | `.env.example`, `README.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, this file |

---

## 12A. Plant doctor — detection-quality upgrade (12 Nov 2026)

**Why**

A single vision model reading a bare photo can be confidently wrong, and a
blurry phone shot produced a low-value diagnosis after a long wait. This pass
gives the model real farm context, makes the reply more honest and structured,
adds an independent cross-check, and catches weak photos before the AI call.

**Prompt and context**

- `disease-context.ts` attaches the crop's growth stage, day since sowing and
  stage-specific threats from `crop-guide.ts`, plus a compact 3-day weather line
  from Open-Meteo. Weather uses a 2.5 s abort and is dropped on failure/absence,
  so a slow forecast never blocks a scan.
- The prompt now asks the model to judge subject (`plant` / `not_plant` /
  `unclear`) and photo quality first, then return ranked `differentials`,
  `spreadRisk`, `urgency`, `retakeAdvice` and a `monitoring` date. It is told to
  use context only to rank candidates, never to override visible evidence.
- The normaliser cleans all new fields, sorts and de-duplicates differentials,
  clears disease fields for healthy/non-plant photos, downgrades a `diseased`
  reply below 0.40 confidence to `uncertain`, and defaults retake advice when the
  photo is poor or confidence is low.

**Second opinion**

- When Gemini's first read is `uncertain`, photo-limited or below 0.60
  confidence, and `GROQ_API_KEY` is set, Groq reads the same photo independently
  (capped at 12 s and only started within 24 s of the request). Agreement raises
  confidence by up to 0.08; disagreement lowers it, keeps the stronger read and
  adds the other diagnosis to the differential list. `source` becomes
  `gemini+groq`. `DISEASE_SECOND_OPINION=false` disables this.
- The original Gemini-only fallback chain is unchanged when Groq is missing or
  the cross-check fails.

**Photo quality + UI**

- `prepareScanImage()` now keeps more detail (1280 px, quality 0.86 → 0.64,
  ≤ 1.4 MB) and runs a 240 px grayscale analysis for brightness and Laplacian
  variance. Blurry, dark, overexposed or low-resolution photos get an inline
  warning; the action becomes "Scan this photo anyway".
- The result card shows differential diagnoses with confidence bars, urgency and
  spread-risk chips, photo-quality/retake guidance, a monitoring reminder, and
  one-tap "take a better photo" / "scan another plant part" actions.
- New Odia strings cover the quality warning, urgency/spread labels, retake
  actions and differential section.

**Database**

- Migration `0006_disease_scan_context.sql` adds `subject`, `image_quality`,
  `retake_advice`, `spread_risk`, `urgency`, `differentials` (jsonb) and
  `monitoring` to `disease_scans`. Apply with `npm run db:push`.

**Verification**

```
npm run typecheck   → 0 errors
npm run lint        → 0 errors (1 pre-existing warning: i18n core `exact`)
npm test            → 51 camera + 12 disease tests pass
npm run build       → succeeds (28 routes)
```

---

## 13. Persistent camera alarms + steadier detection (10 Nov 2026)

**Why**

The first alarm build only showed the newest event for a moment and could stop
the siren on its own; a dropped poll, an ended session or an AI disagreement
could silently silence a real intrusion. Detection also weakened when the phone
moved. This pass makes alarms impossible to miss and keeps tracking usable while
the camera shakes or pans.

**Alarms that never stop themselves**

- One `CameraAlarmBanner` manager is mounted in the dashboard layout, so moving
  between dashboard pages no longer unmounts the siren.
- Every unresolved alarm is a separate popup (`role="log"`, assertive live
  region) and the continuous two-carrier siren plays until a human stops it.
  A failed poll, an ended camera, a Groq refutation or an expired login keeps
  the alarm ringing and shows a status line instead of clearing it.
- **Stop siren** silences audio immediately and acknowledges only the snapshot
  that was on screen (`throughId`); a newer alarm that arrived simultaneously
  keeps ringing. Dismissing one popup acknowledges just that alarm.
- Account-scoped latches + dismissal tombstones live in `localStorage`
  (`camera-alarm-inbox.ts`), so a reload restores unresolved alarms and keeps
  stopped ones muted even when the network never confirms the acknowledgement.
  Stored alarms are pre-marked as seen so a reload does not re-fire OS popups.
- The server no longer suppresses alarms with a cooldown, and a Groq refutation
  keeps the row for human review ("AI could not confirm; please review") instead
  of retracting it. Retried uploads return the unread receipt again, and a
  missing alarm row for an existing detection is repaired.
- Notification permission is separate from siren muting; in-app popups need no
  permission. Native notifications are an open-app fallback (service worker
  click focuses the dashboard instead of reloading).

**Steadier detection and camera movement**

- `camera-tracker.ts` matches with velocity-aware gating, confirmation votes and
  frame-relative motion so a pan does not relabel a person as a new track.
  `camera-motion.ts` estimates translation and exposure and only alarms on the
  residual.
- Confirmed event frames are frozen and reserved synchronously in
  `camera-event-buffer.ts` (max 32), surviving stops, flips, failed encodes and
  camera restarts; detection pauses at capacity instead of dropping evidence.
- `camera-capture.ts` encodes frozen frames with an 8 s timeout and optional
  cancellation; `camera-preview.ts` validates frame versions/dimensions and
  cleans up object URLs. Watch polling/decoding is serialised and fenced so
  stale responses cannot overwrite newer state.

**Verification**

```
npm run test:camera   → 51 tests, 0 failures (node:test + PGlite)
npx tsc --noEmit      → 0 errors
npm run lint          → 0 errors (2 pre-existing warnings)
npm run build         → succeeds (28 routes)
npm run dev           → all routes compile; /login, /watch, /camera, /, /map, /crops, /detect return 200
```

- The PGlite suite exercises alarm pagination/totals/dismissal filters,
  ingestion dedupe/repair, Groq review, frame versioning and stopped-session
  fences against a local database — no remote writes.
- No real-camera accuracy or physical-loudness test was run, and browser UI
  inspection was skipped because this sandbox has no signed-in session.

**Files added / changed**

| Area | Files |
| --- | --- |
| Alarm UI | `src/components/watch/CameraAlarmBanner.tsx`, `src/app/(dashboard)/layout.tsx` |
| Alarm data | `src/lib/camera-alarm-inbox.ts`, `src/lib/camera-alert-request.ts`, `src/lib/camera-queries.ts`, `src/app/api/camera/alerts/route.ts` |
| Audio / native | `src/lib/alarm.ts`, `public/alarm-notifications-sw.js` |
| Camera pipeline | `src/components/camera/CameraStreamView.tsx`, `src/components/watch/WatchView.tsx`, `src/lib/camera-tracker.ts`, `camera-motion.ts`, `camera-capture.ts`, `camera-event-buffer.ts`, `camera-preview.ts` |
| Tests | `tests/camera/*.test.ts`, `package.json` (`test:camera`) |
| i18n / docs | `src/lib/i18n/dictionary/watch.ts`, `camera.ts`, `patterns.ts`, `LIVE_CAMERA.md` |

