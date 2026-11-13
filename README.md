# 🌾 AgroAI

A mobile-first assistant for small and marginal farmers, combining free satellite
imagery, hyper-local weather, an AI weekly crop advisory, and a phone-powered
live field camera that recognises people and animals in near real time.

> **Status:** fully functional on Neon — farms, crops, soil tests, reports and
> live camera detections persist on branch `production`; Gemini advisory,
> on-device COCO-SSD detection and the deterministic soil/work-window engines
> are wired. See [`PROGRESS.md`](./PROGRESS.md) for the verification report and
> [`LIVE_CAMERA.md`](./LIVE_CAMERA.md) for the demo setup.

## Features

The public landing page at `/` introduces Land Security and Plant Security with
a tabbed, illustrative tour of the workstation. The signed-in app opens at
`/dashboard`.

1. **Name + PIN accounts & onboarding** — a 4-step flow collects the farmer's
   name, farm, crop and crop day, then creates a PIN (suggested as `name1234`).
   Every farm, crop, report, weather and camera request is scoped to the
   signed-in farmer; the dashboard has a sign-out button.
2. **Satellite farmland mapping** — draw a field boundary on Esri World Imagery;
   the app computes the centroid and area in **acres, hectares and m²** and saves
   it. The satellite field polygon is also drawn on the dashboard map.
3. **Hyper-local weather & field-work plan** — 7-day forecast from Open-Meteo
   for the exact field centre (or the phone's live GPS), now including ET₀,
   radiation, soil temperature/moisture, VPD and leaf wetness. A deterministic
   plan answers "should I work today, and when?" with per-day go/care/wait
   verdicts and sowing, spraying, irrigation, fertiliser, weeding and harvest
   windows.
4. **Crop-day guide** — deterministic stage-by-stage tasks based on the crop,
   crop day and expected duration supplied during onboarding.
5. **Pest siren** — rule-based risk analysis of crop stage + live weather, with a
   Web Audio siren, browser notification and a transparent "why this score"
   breakdown for high-risk days.
6. **Weekly AI crop advisory** — add crops with sowing dates; Gemini produces a
   5-section action plan (irrigation, fertiliser/spray timing, pest watch, best
   field-work days, next step) using ET₀, workable days and the soil test. Falls
   back to a rule-based plan when the Gemini API is unavailable.
7. **Live field camera (real, not simulated)** — `/watch` pairs a phone with a
   QR code. The phone runs **COCO-SSD on-device** and tracks **only humans and
   animals** (vehicles and generic motion are filtered out). A track is logged
   once it is confirmed across several frames, and each confirmed human/animal
   raises a **dashboard alarm** with an optional siren + browser notification.
   **Event-only mode is the default:** the phone keeps detecting locally and
   sends a photo only when a confirmed event is queued, plus a slow heartbeat,
   so it can stay open on mobile data. Continuous preview is an opt-in toggle.
   An optional Groq vision model double-checks new tracks.
   **The old fake `simulate` intrusion panel has been removed.**
8. **Plant doctor (photo disease detection)** — `/detect` lets the farmer take a
   photo (rear camera on a phone) or upload one of any affected plant part. The
   browser compresses it, Gemini Vision identifies the most likely disease,
   pest damage or nutrient problem, and the app returns a confidence score,
   visible symptoms, immediate actions, low-cost/organic options, a cautious
   chemical option and prevention advice. An optional Hugging Face PlantVillage
   classifier runs in parallel as a consensus signal, and the result card shows
   which models agreed.
9. **Soil Health Card & crop fit** — enter the values printed on an Indian Soil
   Health Card (pH, EC, organic carbon, N/P/K, texture). The app rates the soil,
   explains every limitation, and ranks 22 locally relevant crops against soil,
   12-month rainfall/temperature and the sowing month. Without a soil test the
   result is clearly labelled as an estimate.
10. **Daily checklist** — up to nine reasoned tasks built from the crop stage,
    forecast, pest risk and soil test, with morning/evening timing, idempotent
    completion, XP and streaks.
11. **Satellite field check (optional)** — cloud-masked Sentinel-2 NDVI for the
    saved polygon via a free Copernicus Data Space client, with observation date,
    usable-pixel share, previous-scene comparison and honest limits.

## Tech stack

- **Framework:** Next.js 16 (App Router, TypeScript, Turbopack)
- **Styling:** Tailwind CSS v4
- **Database:** Neon Postgres + Drizzle ORM (`@neondatabase/serverless`)
- **Maps:** Leaflet + react-leaflet with Esri World Imagery tiles
- **Weather:** Open-Meteo (no API key)
- **AI:** Google Gemini (`@google/generative-ai`) for weekly advisories and
  plant-photo disease detection (optional Groq fallback + optional Hugging Face
  PlantVillage classifier as a consensus signal)
- **Soil & climate:** Soil Health Card input + Open-Meteo ERA5 12-month normals
- **Satellite:** optional Copernicus Data Space Sentinel-2 NDVI
- **On-device vision:** TensorFlow.js (`tfjs-core`, `tfjs-converter`,
  `tfjs-backend-webgl`) + `@tensorflow-models/coco-ssd`
- **Optional vision verifier:** Groq (`qwen/qwen3.8-27b`, OpenAI-compatible API)

## Getting started

```bash
npm install
neon deploy         # pulls DATABASE_URL (+DATABASE_URL_UNPOOLED) into .env.local
npm run db:push     # create/update the tables in Neon (direct connection)
npm run dev         # http://localhost:3000
```

### Phone camera in 60 seconds

1. Open `/watch` on the laptop and tap **Pair a phone**.
2. Scan the QR code with the phone (same Wi-Fi for local development).
3. Allow camera + location, tap **Start camera stream**, and point the rear
   camera at the field.
4. Walk a person or animal through the frame. The laptop shows the live box,
   label, confidence and movement trail; after a moment the track is confirmed
   and a notification popup appears with a continuous high-pitched siren.
   Vehicles are ignored on purpose.

Phone browsers expose the camera only on **HTTPS** (or `localhost`). For a local
LAN demo use an HTTPS tunnel (`cloudflared`, `ngrok`, Vercel) or enable the
Android Chrome insecure-origin flag. Full steps:
[`LIVE_CAMERA.md`](./LIVE_CAMERA.md).

### Environment variables

| Key | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Pooled Neon Postgres connection string (app runtime). |
| `DATABASE_URL_UNPOOLED` | Yes | Direct Neon string — used by Drizzle Kit for migrations. |
| `AUTH_SECRET` | Yes in production | HMAC secret for the signed name + PIN session cookie. |
| `AUTH_COOKIE_SECURE` | No | Set `false` only for local `next start` tests over http. |
| `GEMINI_API_KEY` | Required for scans | Enables Gemini advisories and plant-photo disease detection; the weekly advisory still uses a rule-based fallback. |
| `GEMINI_MODEL` | No | Overrides the model (default `gemini-3.8-flash`). |
| `DISEASE_GEMINI_TIMEOUT_MS` | No | Plant-scan Gemini timeout in ms (default `40000`, max `55000`). |
| `GEMINI_BASE_URL` | No | Overrides the Gemini endpoint (proxy or local mock). |
| `GROQ_API_KEY` | No | Enables the Groq vision verifier for camera tracks, the plant-doctor fallback and the low-confidence second opinion. |
| `GROQ_VISION_MODEL` | No | Overrides the verifier model (default `qwen/qwen3.8-27b`). |
| `GROQ_DISEASE_MODEL` | No | Plant-scan fallback/second-opinion model (default `qwen/qwen3.8-27b`). |
| `GROQ_DISEASE_TIMEOUT_MS` | No | Plant-scan Groq timeout in ms (default `18000`, max `45000`). |
| `DISEASE_SECOND_OPINION` | No | Set `false` to skip the Groq cross-check on uncertain plant scans. |
| `GROQ_TIMEOUT_MS` | No | Camera verifier timeout in ms (default `4500`, max `15000`). |
| `CRON_SECRET` | No | Protects `/api/cron/weekly-report`. |

Weather, satellite imagery and the on-device detector need no API keys. The
detector downloads its ~6 MB COCO-SSD weights from Google Storage the first time
a camera starts, then the browser caches them. Without `GROQ_API_KEY` the
on-device labels are used as-is and no frame leaves your server.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server. |
| `npm run dev:https` | Start with a self-signed HTTPS certificate for phone camera testing. |
| `npm run build` / `npm run start` | Production build and serve. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm test` / `npm run test:disease` | Camera unit tests plus plant-doctor normaliser/merge tests. |
| `npm run db:generate` | Generate SQL migrations from the Drizzle schema. |
| `npm run db:push` | Apply the schema to Neon. |
| `npm run db:studio` | Open Drizzle Studio. |

## Project structure

```
src/
├─ app/
│  ├─ (dashboard)/           # dashboard, /map, /crops, /watch, /detect (auth-gated)
│  ├─ camera/                # standalone phone camera page (token link)
│  ├─ login/ onboarding/     # name + PIN login and 4-step signup
│  ├─ api/                   # auth, farms, crops, weather, camera, disease, reports, pest-risk, cron
│  ├─ layout.tsx, manifest.ts, not-found.tsx, globals.css
├─ components/               # auth, map, weather, crops, camera, watch, disease, dashboard, ui
├─ db/                       # Drizzle schema + lazy client
└─ lib/                      # auth, camera, disease*, groq, alarm, crop-guide, pest-risk, geo, weather, gemini, queries
drizzle/                     # generated SQL migrations
```

## API reference

| Method | Route | Description |
| --- | --- | --- |
| `GET` / `POST` | `/api/farms` | List or create farmlands. |
| `GET` | `/api/weather` | Weather by `lat`/`lng`, or by `farmId`. |
| `GET` / `POST` | `/api/crops` | List or create crops. |
| `GET` / `POST` | `/api/camera/sessions` | List camera sessions / create a pairing token. |
| `GET` / `PATCH` / `DELETE` | `/api/camera/sessions/:id` | Session detail, stop/restart, delete. |
| `GET` | `/api/camera/sessions/:id/frame` | Latest JPEG (auth cookie). |
| `GET` / `POST` | `/api/camera/stream/:token` | Public token-scoped pairing + frame ingest (multipart or JSON). |
| `GET` / `POST` | `/api/camera/alerts` | Unread human/animal alarms (`?all=1` for history); acknowledge one or all. |
| `GET` | `/api/camera/network` | LAN IPv4 addresses for the phone QR link. |
| `POST` | `/api/disease/detect` | Plant-photo scan (multipart image + crop/part/note); returns the saved AI verdict. |
| `GET` | `/api/disease/scans` | The farmer's recent scans (`?limit=18&before=id`). |
| `DELETE` | `/api/disease/scans/:id` | Remove a saved scan. |
| `GET` | `/api/disease/scans/:id/image` | The auth-scoped scan JPEG. |
| `GET` | `/api/reports` | List weekly reports. |
| `GET` / `POST` | `/api/cron/weekly-report` | Generate weekly advisories. |

## Notes

- Built with Next.js **Cache Components** enabled; data-touching GET handlers are
  intentionally dynamic.
- The phone analyses frames locally. Only a downscaled JPEG + detection metadata
  is uploaded (multipart, no base64 overhead); the server stores the newest frame
  per session and one row per new **confirmed** human/animal track. Raw video
  never leaves the phone.
- Alarms live in `camera_alerts` and are polled by the dashboard banner (4 s on
  `/watch`, 6 s on the dashboard). One alarm per camera at most every 8 s.
- Notifications use the browser `Notification` API (no service worker), so they
  appear while the app is open.

## License

Private / unlicensed — see the repository owner.
