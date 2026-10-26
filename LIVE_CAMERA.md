# 📷 AgroAI Live Field Camera — demo & science-exhibition guide

Satellites are excellent at mapping land, but they cannot see a wild boar walking
through a paddy field at 7 pm. AgroAI now uses a **phone as an edge camera**:
the phone sees the field, runs AI locally, and the laptop shows a near-live
security feed with real animal/human tracks.

The old `simulate` intrusion page and its fake alerts have been removed. Every
box and event on `/watch` now comes from a camera frame.

---

## 1. The two pages

| Page | Device | Purpose |
| --- | --- | --- |
| `/watch` | Laptop (signed in) | Pair a phone, watch the live feed, see detection boxes/trails/feed, field weather |
| `/camera?token=…` | Phone | Camera preview, on-device detection, uploads frames; no login needed |

`/camera` uses a random **pairing token** instead of the farmer's login cookie.
The token is scoped to one session and can be deleted or stopped from `/watch`.

---

## 2. Quick start (local, same Wi-Fi)

```bash
npm run dev
```

1. Open `http://localhost:3000/watch` on the laptop and sign in.
2. Tap **Pair a phone**. A QR code and camera link appear.
3. The link automatically uses your laptop's LAN IP, e.g.
   `http://192.168.1.20:3000/camera?token=…`.
4. Scan the QR with the phone, allow camera + location, tap
   **Start camera stream**.
5. Walk through the frame. The laptop updates every ~1 second.

> **Phone browsers only expose the camera on HTTPS or `localhost`.** A LAN URL
> like `http://192.168.1.20:3000` is **not** a secure context on the phone, so
> `getUserMedia` will be blocked. Pick one of the HTTPS options below.

### Option A — HTTPS tunnel (best for the exhibition)

Any tunnel gives both devices a real HTTPS URL:

```bash
# Cloudflare (no account needed for a quick tunnel)
cloudflared tunnel --url http://localhost:3000

# or ngrok
ngrok http 3000
```

Open the printed `https://…` URL on the laptop, pair the phone, scan the QR.
The camera link will automatically use the HTTPS origin.

### Option B — deploy to Vercel

Deploy with the same Neon + `.env` values. The public `https://…vercel.app`
URL works on both devices, including mobile data (no shared Wi-Fi needed).

### Option C — `npm run dev:https`

```bash
npm run dev:https
```

Next.js creates a self-signed certificate. Open
`https://<laptop-ip>:3000` on the phone and accept the warning. Some phones
(especially iOS) still refuse camera access on an untrusted certificate; use
Option A if that happens.

### Option D — Android Chrome demo flag (no HTTPS)

1. On the phone open
   `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
2. Set it to **Enabled**.
3. Add the origin shown in the pairing card, e.g. `http://192.168.1.20:3000`.
4. Relaunch Chrome and open the camera link.

This is a demo-only workaround; use HTTPS for real deployments.

---

## 3. What happens under the hood

```
Phone /camera
  getUserMedia (rear camera)
        │
        ├─ COCO-SSD (TensorFlow.js, WebGL) every ~420 ms
        │     person / cow / dog / elephant / horse / car …
        │
        ├─ frame differencing every ~150 ms (motion score + fallback box)
        │
        ├─ IoU tracker → stable track ids, path, direction, speed
        │
        └─ every ~800 ms: 560 px JPEG (quality 0.55)
             + normalised boxes + GPS + AI/motion metadata
                          │
                          ▼
             POST /api/camera/stream/:token
                          │
             camera_sessions (latest frame + overlay state)
             camera_detections (one row per new track)
                          │
                          ▼
Laptop /watch
  polls /api/camera/sessions/:id every 900 ms
  <img> = latest frame (versioned, cached)
  boxes/trails drawn as an overlay from latestDetections
```

### Why it feels live

- Frames are versioned with `?v=<timestamp>` and cached, so the browser only
  downloads a new image when the phone sends one.
- The player polls at 900 ms and the phone uploads at 800 ms. Expected glass-to-
  glass latency is **1.5–2.5 s**, which is enough for a field watch demo.
- Boxes animate between positions with a 300 ms CSS transition, so movement looks
  smooth even at ~1 fps.

### Why it is private / low-bandwidth

- Raw video never leaves the phone.
- One frame is ~30–60 KB. A 10-minute demo uploads roughly 20–40 MB.
- Only the newest frame is stored per session. Detection events are one row per
  new tracked object, not per frame.

### Detection classes

COCO-SSD recognises **person** plus animals such as cow, dog, cat, horse, sheep,
bird, elephant, bear, zebra and giraffe, and vehicles such as car, motorcycle,
truck and bus. Farm-specific labels (wild boar, tiger, leopard, monkey) are also
mapped if a custom model sends them. Anything the model misses still produces a
green **Movement** box from frame differencing, so the demo never looks dead.

Tiger/leopard/wild-boar detection with high accuracy needs a custom-trained
model; the current demo is honest about using a general COCO model + motion
fallback.

---

## 4. 2-minute exhibition script

1. **Map the land first** — open `/map`, tap **Locate me**, outline the field.
   Point out the live area calculation: acres + hectares + m², computed from the
   satellite polygon.
2. **Show the field weather** — the dashboard uses the field centroid for
   Open-Meteo (rain, wind, soil moisture).
3. **Pair the phone** — open `/watch` on the laptop, tap **Pair a phone**, scan
   the QR. Put the phone on a tripod / lean it against a bottle facing the demo
   field or a volunteer.
4. **Start the stream** — the phone shows `LIVE`, `AI ready`, and detection chips.
5. **Walk through frame** — the laptop shows a yellow **Person** box, a movement
   trail, confidence, direction, and a new row in the detection feed.
6. **Show the field context** — the phone GPS links the camera to the nearest
   mapped field (distance + compass direction) and live weather at the camera.
7. **Close the loop** — satellites mapped the land; the camera sees what moves on
   it. No synthetic alerts.

Tips:

- Use the rear camera and good light; use the torch button if the phone supports
  it.
- Keep the phone screen awake — the page requests a screen wake lock.
- Keep the phone on the same Wi-Fi/tunnel as the laptop.
- If the AI model is still downloading, motion mode already works; the badge
  switches to **AI ready** when the model finishes.

---

## 5. Troubleshooting

| Symptom | Fix |
| --- | --- |
| “Camera needs a secure connection” | Use an HTTPS tunnel/Vercel, or the Android Chrome flag (Option D). |
| “Requested device not found” | Close other camera apps; grant camera permission; try the rear camera. |
| Camera link “not valid any more” | The session was deleted. Create a new pairing on `/watch`. |
| “Stopped from the laptop” | The owner tapped **Stop stream**. Tap **Restart stream** on `/watch`, then reload `/camera`. |
| No frames on the laptop | Check the phone shows **Receiving**; check both devices can reach the same URL; tap **Refresh** on `/watch`. |
| AI badge stuck on “Loading AI…” | First load downloads ~6 MB of model weights. Motion mode keeps working; check the network or let it finish. |
| Boxes offset from the video | The stored frame aspect ratio is used for the player; refresh the page. On a real phone the frame is 16:9/4:3 and aligns automatically. |
| Phone GPS not shared | Allow location for the site; some browsers require HTTPS (use the tunnel). |

---

## 6. Data model

Two tables were added in migration `0002_live_camera_tables.sql`:

- **`camera_sessions`** — owner, pairing token, status, device label, GPS, latest
  JPEG, frame dimensions, current overlay detections, motion, counters and
  timestamps.
- **`camera_detections`** — one row per newly tracked object: label, emoji,
  category, confidence, track id, box, direction, speed, GPS and time.

`0003_remove_simulated_alerts.sql` drops the old `intrusion_alerts` table. The
`/api/alerts` and `/api/alerts/check` routes and the `/simulate` page were
removed from the codebase.

---

## 7. API quick reference

```http
POST   /api/camera/sessions            { "name": "Field camera 1" }   (auth)
GET    /api/camera/sessions                                          (auth)
GET    /api/camera/sessions/:id                                      (auth)
PATCH  /api/camera/sessions/:id        { "status": "ended" | "live" } (auth)
DELETE /api/camera/sessions/:id                                      (auth)
GET    /api/camera/sessions/:id/frame                                (auth)
GET    /api/camera/stream/:token                                     (token)
POST   /api/camera/stream/:token       { frame, detections, lat, lng, motion, … }
GET    /api/camera/network                                           (auth)
```

Frame ingest response includes `newDetections`; the phone can use that to show
how many events were logged.
