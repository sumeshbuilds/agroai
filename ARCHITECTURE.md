# AgroAI - System Architecture & Rules

## 1. Project Overview
AgroAI is a zero-cost MVP web application (PWA) for farmers. It provides four core features:
1. **Farmland Boundary Mapping:** Farmers draw their farmland polygon on a satellite map; the app calculates area (acres / hectares / m²) and uses the centroid for hyper-local weather.
2. **Live Field Camera:** A phone acts as an edge camera (`/camera`). It runs COCO-SSD + frame differencing on-device, tracks people/animals, and streams small JPEG frames + boxes to the laptop dashboard (`/watch`) in near real time. This replaces the old simulated intrusion alerts.
3. **AI Weekly Crop Advisory:** Farmers select their planted crop and sowing date. Every week, an AI analyzes local 7-day weather forecasts and soil metrics to tell them exactly what to do next.
4. **Hyper-Local Weather Dashboard:** Real-time and 7-day agricultural weather forecast (rain, wind, temperature, soil moisture) for their exact farm centroid or the phone's live GPS.

## 2. Strict Tech Stack (Zero-Cost Constraints)
- **Framework:** Next.js 16 (App Router), TypeScript, Tailwind CSS, Lucide Icons.
- **Database:** Neon Serverless Postgres (`@neondatabase/serverless`) with Haversine spatial calculations.
- **ORM:** Drizzle ORM (`drizzle-orm`, `drizzle-kit`).
- **Maps:** `leaflet` and `react-leaflet` using Esri World Imagery free satellite tiles (`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`). NEVER use Google Maps or Mapbox (they require billing).
- **Weather API:** Open-Meteo API (`https://api.open-meteo.com/v1/forecast`). No API key required.
- **AI Engine:** Google Gemini API (`@google/generative-ai`) using the free tier model `gemini-3.8-flash`.
- **Edge vision:** TensorFlow.js + COCO-SSD on the phone (`tfjs-core`, `tfjs-converter`, `tfjs-backend-webgl`), with a frame-differencing motion fallback.
- **Live transport:** Token-scoped camera sessions + ~1 fps JPEG snapshots + normalised detection boxes, polled by the dashboard. No WebRTC signalling server and no paid video CDN.
- **Alerts:** Real camera detections only; browser Notification API and optional Web Audio siren. Local (no VAPID keys).

## 3. Directory Structure
```text
src/
├── app/
│   ├── (dashboard)/
│   │   ├── page.tsx               # Main Farmer Dashboard (Live camera card + Weather + Crop guide)
│   │   ├── map/page.tsx           # Interactive Satellite Map (draw farm + area)
│   │   ├── crops/page.tsx         # Crop Management & Weekly AI Reports
│   │   └── watch/page.tsx         # Live field watch (pair phone, live feed, detections)
│   ├── camera/page.tsx            # Standalone phone camera page (?token=…), no login
│   ├── api/
│   │   ├── farms/route.ts         # Save/Fetch farm polygons & centroids
│   │   ├── weather/route.ts       # Proxy to Open-Meteo with agricultural metrics
│   │   ├── camera/…               # Sessions, pairing tokens, frame ingest/serve, LAN IPs
│   │   └── cron/weekly-report/route.ts # Generates weekly Gemini AI crop report
├── components/
│   ├── map/…                      # Leaflet boundary drawer + read-only dashboard map
│   ├── camera/CameraStreamView    # Mobile camera, on-device AI, overlays, uploads
│   ├── watch/…                    # Laptop live player, overlays, pairing QR, feed
│   ├── weather/WeatherCard.tsx    # 7-day agro weather display
│   └──…
├── db/
│   ├── index.ts                   # Neon connection
│   └── schema.ts                  # Drizzle schema
└── lib/
    ├── camera.ts                  # Shared detection/session types + label map
    ├── camera-queries.ts          # Sessions, dedupe, ingest
    ├── weather.ts                 # Open-Meteo fetcher
    └── gemini.ts                  # Prompt builder for crop advisory
```

## 4. Coding Rules for AI Assistant (OpenCode)
- Always render Leaflet components dynamically with `next/dynamic` and `{ ssr: false }` to prevent `window is not defined` errors.
- Include Leaflet CSS (`import 'leaflet/dist/leaflet.css'`) inside the map component.
- Keep the UI high-contrast, mobile-first, with large touch targets suitable for farmers outdoors.
- Ensure all API routes handle missing environment variables gracefully with clear error messages.
- Camera access requires a **secure context**: HTTPS or `localhost`. Never assume `getUserMedia` exists on a plain LAN `http://` URL; show the setup guidance from `LIVE_CAMERA.md`.
- Phone pages must stay token-scoped; never expose another farmer's camera session.
- Frames are snapshots, not video: keep uploads downscaled (≤560 px, JPEG ~0.55) and only store the newest frame per session.
