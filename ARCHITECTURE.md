# AgroAI - System Architecture & Rules

## 1. Project Overview
AgroAI is a zero-cost MVP web application (PWA) for farmers. It provides three core features:
1. **Farmland Boundary Mapping & Intrusion Alerts:** Farmers draw their farmland polygon on a satellite map. When wildlife/predators or thermal hazards are logged within a 3 km radius of their polygon, they get an instant alert.
2. **AI Weekly Crop Advisory:** Farmers select their planted crop and sowing date. Every week, an AI analyzes local 7-day weather forecasts and soil metrics to tell them exactly what to do next.
3. **Hyper-Local Weather Dashboard:** Real-time and 7-day agricultural weather forecast (rain, wind, temperature, soil moisture) for their exact farm centroid.

## 2. Strict Tech Stack (Zero-Cost Constraints)
- **Framework:** Next.js 14/15 (App Router), TypeScript, Tailwind CSS, Lucide Icons.
- **Database:** Neon Serverless Postgres (`@neondatabase/serverless`) with **PostGIS** or Haversine spatial calculations.
- **ORM:** Drizzle ORM (`drizzle-orm`, `drizzle-kit`).
- **Maps:** `leaflet` and `react-leaflet` using Esri World Imagery free satellite tiles (`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`). NEVER use Google Maps or Mapbox (they require billing).
- **Weather API:** Open-Meteo API (`https://api.open-meteo.com/v1/forecast`). No API key required.
- **AI Engine:** Google Gemini API (`@google/generative-ai`) using the free tier model `gemini-2.5-flash`.
- **Alerts:** Web Push Notifications (`Notification` API + Web Audio API siren) + simulated in-app real-time alert banner.

## 3. Directory Structure
```text
src/
├── app/
│   ├── (dashboard)/
│   │   ├── page.tsx               # Main Farmer Dashboard (Weather + Active Alerts + Latest Report)
│   │   ├── map/page.tsx           # Interactive Satellite Map (Draw Farm + View Animal Sightings)
│   │   ├── crops/page.tsx         # Crop Management & Weekly AI Reports
│   │   └── simulate/page.tsx      # Admin/Demo panel to simulate predator movement & trigger alerts
│   ├── api/
│   │   ├── farms/route.ts         # Save/Fetch farm polygons & centroids
│   │   ├── weather/route.ts       # Proxy to Open-Meteo with agricultural metrics
│   │   ├── alerts/check/route.ts  # Spatial query to check animal proximity to farms
│   │   └── cron/weekly-report/route.ts # Generates weekly Gemini AI crop report
├── components/
│   ├── MapDrawer.tsx              # Client-only Leaflet component (`ssr: false`)
│   ├── WeatherCard.tsx            # 7-day agro weather display
│   └── AlertBanner.tsx            # High-priority intrusion warning UI with audio alarm
├── db/
│   ├── index.ts                   # Neon connection
│   └── schema.ts                  # Drizzle schema
└── lib/
    ├── weather.ts                 # Open-Meteo fetcher
    └── gemini.ts                  # Prompt builder for crop advisory
```

## 4. Coding Rules for AI Assistant (OpenCode)
- Always render Leaflet components dynamically with `next/dynamic` and `{ ssr: false }` to prevent `window is not defined` errors.
- Include Leaflet CSS (`import 'leaflet/dist/leaflet.css'`) inside the map component.
- Keep the UI high-contrast, mobile-first, with large touch targets suitable for farmers outdoors.
- Ensure all API routes handle missing environment variables gracefully with clear error messages.