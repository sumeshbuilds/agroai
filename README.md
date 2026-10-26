# 🌾 AgroAI

A mobile-first assistant for small and marginal farmers, combining free satellite
imagery, hyper-local weather, an AI weekly crop advisory, and wildlife intrusion
alerts.

> **Status:** fully functional on Neon — farm/crop/report/alert data persists on
> branch `production`, Gemini advisory live (`gemini-3.8-flash`). See
> [`PROGRESS.md`](./PROGRESS.md) for the verification report.

## Features

1. **Name + PIN accounts & onboarding** — a 4-step flow collects the farmer's
   name, farm, crop and crop day, then creates a PIN (suggested as `name1234`).
   Every farm, crop, report and weather request is scoped to the signed-in
   farmer; the dashboard has a sign-out button.
2. **Satellite farmland mapping** — draw a field boundary on Esri World Imagery;
   the app computes the centroid and area (acres) and saves it.
3. **Hyper-local weather** — 7-day forecast from Open-Meteo for the exact field
   centre, plus soil moisture and rain/heat/wind warnings.
4. **Crop-day guide** — deterministic stage-by-stage tasks based on the crop,
   crop day and expected duration supplied during onboarding.
5. **Pest siren** — rule-based risk analysis of crop stage + live weather, with a
   Web Audio siren, browser notification and a transparent "why this score"
   breakdown for high-risk days.
6. **Weekly AI crop advisory** — add crops with sowing dates; Gemini produces a
   4-point action plan (irrigation, fertilizer/spray timing, pest watch, next
   step). Falls back to a rule-based plan when the Gemini API is unavailable.
7. **Predator & wildlife alerts** — simulate an animal or fire near your land; if
   it is within 3 km, get a siren, a flashing banner and a browser notification
   with distance and direction.

## Tech stack

- **Framework:** Next.js 16 (App Router, TypeScript, Turbopack)
- **Styling:** Tailwind CSS v4
- **Database:** Neon Postgres + Drizzle ORM (`@neondatabase/serverless`)
- **Maps:** Leaflet + react-leaflet with Esri World Imagery tiles
- **Weather:** Open-Meteo (no API key)
- **AI:** Google Gemini (`@google/generative-ai`)

## Getting started

```bash
npm install
neon deploy         # pulls DATABASE_URL (+DATABASE_URL_UNPOOLED) into .env.local
npm run db:push     # create the tables in Neon (direct connection)
npm run dev         # http://localhost:3000
```

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

Weather and satellite imagery require no keys. The Neon CLI manages the
branch policy in `neon.ts`; adjust it with `neon config plan` / `neon deploy`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server. |
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
│  ├─ (dashboard)/           # dashboard, /map, /crops, /simulate (auth-gated)
│  ├─ login/ onboarding/     # name + PIN login and 4-step signup
│  ├─ api/                   # auth, farms, crops, weather, alerts, reports, pest-risk, cron
│  ├─ layout.tsx, manifest.ts, not-found.tsx, globals.css
├─ components/               # auth, map, weather, crops, alerts, dashboard, ui primitives
├─ db/                       # Drizzle schema + lazy client
└─ lib/                      # auth, crop-guide, pest-risk, geo, weather, gemini, queries, api-client, hooks
drizzle/                     # generated SQL migrations
```

## API reference

| Method | Route | Description |
| --- | --- | --- |
| `GET` / `POST` | `/api/farms` | List or create farmlands. |
| `GET` | `/api/weather` | Weather by `lat`/`lng`, or by `farmId`. |
| `GET` / `POST` | `/api/crops` | List or create crops. |
| `GET` / `POST` | `/api/alerts` | List alerts; create one directly. |
| `POST` | `/api/alerts/check` | Geofence check `{ animalType, lat, lng, source }`. |
| `GET` | `/api/reports` | List weekly reports. |
| `GET` / `POST` | `/api/cron/weekly-report` | Generate weekly advisories. |

## Notes

- Built with Next.js **Cache Components** enabled; data-touching GET handlers are
  intentionally dynamic.
- Notifications use the browser `Notification` API (no service worker), so they
  appear while the app is open.

## License

Private / unlicensed — see the repository owner.
