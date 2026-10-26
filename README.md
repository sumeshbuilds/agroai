# 🌾 AgroAI

A mobile-first assistant for small and marginal farmers, combining free satellite
imagery, hyper-local weather, an AI weekly crop advisory, and a phone-powered
live field camera that recognises people and animals in near real time.

> **Status:** fully functional on Neon — farms, crops, reports and live camera
> detections persist on branch `production`; Gemini advisory and COCO-SSD
> on-device detection are wired. See [`PROGRESS.md`](./PROGRESS.md) for the
> verification report and [`LIVE_CAMERA.md`](./LIVE_CAMERA.md) for the demo
> setup.

## Features

1. **Name + PIN accounts & onboarding** — a 4-step flow collects the farmer's
   name, farm, crop and crop day, then creates a PIN (suggested as `name1234`).
   Every farm, crop, report, weather and camera request is scoped to the
   signed-in farmer; the dashboard has a sign-out button.
2. **Satellite farmland mapping** — draw a field boundary on Esri World Imagery;
   the app computes the centroid and area in **acres, hectares and m²** and saves
   it. The satellite field polygon is also drawn on the dashboard map.
3. **Hyper-local weather** — 7-day forecast from Open-Meteo for the exact field
   centre (or the phone's live GPS), plus soil moisture and rain/heat/wind
   warnings.
4. **Crop-day guide** — deterministic stage-by-stage tasks based on the crop,
   crop day and expected duration supplied during onboarding.
5. **Pest siren** — rule-based risk analysis of crop stage + live weather, with a
   Web Audio siren, browser notification and a transparent "why this score"
   breakdown for high-risk days.
6. **Weekly AI crop advisory** — add crops with sowing dates; Gemini produces a
   4-point action plan (irrigation, fertilizer/spray timing, pest watch, next
   step). Falls back to a rule-based plan when the Gemini API is unavailable.
7. **Live field camera (real, not simulated)** — `/watch` pairs a phone with a
   QR code. The phone runs **COCO-SSD on-device** (with a motion fallback),
   tracks each person/animal across frames, and uploads small JPEG frames plus
   normalised boxes. The laptop shows a near-live feed with moving boxes, trails,
   confidence, direction, a detection feed and field weather from the phone's
   GPS. Frames are ~30–60 KB each at ~1 fps, so it works on a normal mobile data
   connection. **The old fake `simulate` intrusion panel has been removed.**

## Tech stack

- **Framework:** Next.js 16 (App Router, TypeScript, Turbopack)
- **Styling:** Tailwind CSS v4
- **Database:** Neon Postgres + Drizzle ORM (`@neondatabase/serverless`)
- **Maps:** Leaflet + react-leaflet with Esri World Imagery tiles
- **Weather:** Open-Meteo (no API key)
- **AI:** Google Gemini (`@google/generative-ai`)
- **On-device vision:** TensorFlow.js (`tfjs-core`, `tfjs-converter`,
  `tfjs-backend-webgl`) + `@tensorflow-models/coco-ssd`

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
   label, confidence and movement trail.

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
| `GEMINI_API_KEY` | No | Enables Gemini advisories; otherwise a rule-based fallback is used. |
| `GEMINI_MODEL` | No | Overrides the model (default `gemini-3.8-flash`). |
| `CRON_SECRET` | No | Protects `/api/cron/weekly-report`. |

Weather, satellite imagery and the on-device detector need no API keys. The
detector downloads its ~6 MB COCO-SSD weights from Google Storage the first time
a camera starts, then the browser caches them.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server. |
| `npm run dev:https` | Start with a self-signed HTTPS certificate for phone camera testing. |
| `npm run build` / `npm run start` | Production build and serve. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm run db:generate` | Generate SQL migrations from the Drizzle schema. |
| `npm run db:push` | Apply the schema to Neon. |
| `npm run db:studio` | Open Drizzle Studio. |

## Project structure

```
src/
├─ app/
│  ├─ (dashboard)/           # dashboard, /map, /crops, /watch (auth-gated)
│  ├─ camera/                # standalone phone camera page (token link)
│  ├─ login/ onboarding/     # name + PIN login and 4-step signup
│  ├─ api/                   # auth, farms, crops, weather, camera, reports, pest-risk, cron
│  ├─ layout.tsx, manifest.ts, not-found.tsx, globals.css
├─ components/               # auth, map, weather, crops, camera, watch, dashboard, ui
├─ db/                       # Drizzle schema + lazy client
└─ lib/                      # auth, camera, crop-guide, pest-risk, geo, weather, gemini, queries
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
| `GET` / `POST` | `/api/camera/stream/:token` | Public token-scoped pairing + frame ingest. |
| `GET` | `/api/camera/network` | LAN IPv4 addresses for the phone QR link. |
| `GET` | `/api/reports` | List weekly reports. |
| `GET` / `POST` | `/api/cron/weekly-report` | Generate weekly advisories. |

## Notes

- Built with Next.js **Cache Components** enabled; data-touching GET handlers are
  intentionally dynamic.
- The phone analyses frames locally. Only a downscaled JPEG + detection metadata
  is uploaded; the server stores the newest frame per session and one row per new
  tracked object. Raw video never leaves the phone.
- Notifications use the browser `Notification` API (no service worker), so they
  appear while the app is open.

## License

Private / unlicensed — see the repository owner.
