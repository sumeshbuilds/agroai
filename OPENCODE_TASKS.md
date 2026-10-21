# AgroAI - Step-by-Step Implementation Plan for OpenCode

Execute these phases sequentially. Complete and test each phase before moving to the next.

## Phase 1: Project Initialization & Neon DB Setup
- [ ] Initialize Next.js with TypeScript and Tailwind CSS.
- [ ] Install dependencies:
  ```bash
  npm i @neondatabase/serverless drizzle-orm leaflet react-leaflet @google/generative-ai lucide-react
  npm i -D drizzle-kit @types/leaflet
  ```
- [ ] Create `.env.local` template with `DATABASE_URL` and `GEMINI_API_KEY`.
- [ ] Create `src/db/index.ts` and `src/db/schema.ts` according to `DATABASE_SCHEMA.md`.
- [ ] Create `drizzle.config.ts` and push the schema to Neon using `npx drizzle-kit push`.

## Phase 2: Satellite Farmland Selector (Feature 1 - Part A)
- [ ] Build `src/components/MapDrawer.tsx` using `react-leaflet` (loaded dynamically with `ssr: false`).
- [ ] Use Esri World Imagery tile layer (`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`) so the farmer sees real satellite imagery of their village and fields for free.
- [ ] Allow the user to click 3+ points on the map to draw their farmland polygon, automatically calculate the centroid `(lat, lng)` and approximate area in acres, and save it to Neon via `POST /api/farms`.

## Phase 3: Weather Forecast Engine (Feature 3)
- [ ] Build `src/lib/weather.ts` that queries Open-Meteo using the saved farm's `centroidLat` and `centroidLng`:
  `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&hourly=soil_moisture_0_to_1cm&timezone=auto`
- [ ] Build `src/components/WeatherCard.tsx` showing today's conditions, surface soil moisture, and a clean 7-day visual forecast with rain and wind warnings.

## Phase 4: Crop Selection & Weekly AI Advisory (Feature 2)
- [ ] Build `src/app/(dashboard)/crops/page.tsx` where farmers add a crop (e.g., Paddy, Mustard, Potato, Cotton, Vegetables) and select the sowing date.
- [ ] Build `POST /api/cron/weekly-report`. It should:
  1. Calculate how many days old the crop is (`currentDate - sowingDate`).
  2. Fetch the next 7 days of weather from `src/lib/weather.ts`.
  3. Send a prompt to `gemini-2.5-flash` asking for a 4-bullet weekly action plan: **Irrigation advice**, **Fertilizer/Spray timing** (e.g., "Do not spray on Wednesday due to high rain probability"), **Pest/Disease watch**, and **Next step**.
  4. Save the output in `weekly_reports` and display it on the dashboard.
  5. Include a "Generate This Week's Report Now" button for instant demo testing.

## Phase 5: Predator & Wildlife Intrusion Alert System (Feature 1 - Part B)
- [ ] Build `POST /api/alerts/check` which receives `{ animalType, lat, lng, source }`.
- [ ] Run the spatial query from `DATABASE_SCHEMA.md` to find all farms within a 3 km radius of the animal coordinates.
- [ ] Build a `/simulate` page showing the satellite map around the farmer's land. When clicking anywhere near the farm on the simulation map, spawn an animal marker (e.g., Elephant Herd / Wild Boar / Tiger / Forest Fire) and call `/api/alerts/check`.
- [ ] If the farm is within the danger radius, trigger a loud siren audio alert in the browser (`AudioContext` oscillator siren), a red flashing `AlertBanner`, and browser `Notification` push alert showing distance and direction.