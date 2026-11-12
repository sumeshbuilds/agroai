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
| `/watch` | Laptop (signed in) | Pair a phone, watch the live feed, see detection boxes/trails/feed, alarms, field weather |
| `/camera?token=…` | Phone | Camera preview, on-device human/animal tracking, adaptive uploads; no login needed |

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
        ├─ COCO-SSD (TensorFlow.js, WebGL) on a 416 px canvas
        │     person / cow / dog / elephant / horse / bird …
        │     vehicles + everything else are dropped
        │
        ├─ IoU tracker → stable track ids, path, direction, speed
        │     + NMS + box smoothing
        │
        ├─ confirmation: 3 hits @ ≥0.42, or 2 hits @ ≥0.82
        │
        └─ adaptive upload: 320–560 px JPEG (quality 0.5–0.65)
             active 0.7 s · idle 2.6 s · slow link 1.4 s / 5–6.5 s
             + normalised boxes + GPS + AI metadata (multipart)
                          │
                          ▼
             POST /api/camera/stream/:token
                          │
             camera_sessions (latest frame + overlay state)
             camera_detections (one row per NEW CONFIRMED human/animal)
             camera_alerts     (one alarm per track — no cooldown, no suppression)
                          │
                          ├─ after(): optional Groq vision check of the frame
                          │    → relabel species / mark verified / flag for review
                          ▼
Laptop /watch + dashboard
  /watch polls the session every ~0.8 s (2.5 s on slow links, backing off on
  failures); the alarm manager polls /api/camera/alerts every ~3 s
  (8 s while the tab is hidden)
  <img> = latest frame (versioned, cached)
  boxes/trails drawn as an overlay from latestDetections
  one persistent popup per unread alarm + continuous siren until stopped
```

### Why it feels live

- Frames are versioned with `?v=<timestamp>` and cached, so the browser only
  downloads a new image when the phone sends one. Hidden tabs poll metadata
  only, so an idle dashboard does not keep downloading JPEGs.
- The player polls at ~0.8 s (2.5 s on a slow link) and backs off exponentially
  when metadata/frame requests fail. The phone uploads every 0.7 s while
  something is moving (2.6 s when idle) on a good link, and stretches the gap
  automatically when measured upload time or failures require it. Expected
  glass-to-glass latency is **1.5–2.5 s** on a normal connection.
- Inference runs on a 416 px copy and only every 350 ms when there is movement,
  so the phone keeps ~25–30 fps for the preview instead of stuttering.
- Boxes animate between positions with a 300 ms CSS transition, so movement looks
  smooth even at ~1 fps.

### Why it is private / low-bandwidth

- Raw video never leaves the phone.
- Frames shrink to 320–560 px and quality 0.34–0.65 on weak links; a typical
  frame is ~20–60 KB. On `saveData`, `2g`, `slow-2g`, a measured upload over
  2.5 s or a failed attempt, the phone switches to the smaller/cheaper frame and
  stretches the upload interval (up to ~30 s) instead of saturating the link.
  A hung upload is aborted after 14–25 s, then retried with exponential backoff.
- JPEGs are posted as `multipart/form-data`, not base64, saving ~33 % bandwidth.
- Only the newest frame is stored per session. Detections are one row per
  **confirmed** human/animal, not per frame.
- The optional Groq check sends **one** frame per new track (never a stream) and
  runs after the response, so it cannot slow the feed.

### What is tracked

Only **people and animals**. The phone filters COCO-SSD output through a
human/animal class catalog, and the server double-checks the category before
writing anything, so parked bikes, cars, tools and random pixel movement never
appear in the feed or raise alarms.

COCO-SSD supplies person plus cow, dog, cat, horse, sheep, bird, elephant, bear,
zebra and giraffe. Farm/wildlife species (wild boar, tiger, leopard, monkey,
deer, buffalo, goat, snake, …) are mapped when the Groq verifier or a future
custom model returns them.

### Confirmation and alarms

- A track must be seen **3 times at ≥ 0.42** confidence (or 2 times at ≥ 0.82)
  before it is logged — a single blurry frame cannot create an event.
- Each confirmed track writes one `camera_detections` row **and** one
  `camera_alerts` row. There is no server-side cooldown or suppression: a second
  person, or the same person after leaving and returning, always raises a new
  alarm.
- Duplicate tracks are ignored for 15 minutes per session. Track ids carry a
  per-run suffix (`p1-abc12`), so reloading the phone does not get swallowed.
- Alarms are **persistent**: the dashboard mounts one alarm manager in the
  layout, so moving between dashboard pages does not stop it. Every unread alarm
  stays on screen as a popup and the siren keeps ringing until a human stops it.
  A lost connection, an ended camera session, an AI disagreement or an expired
  login **never** silences an alarm that is already ringing.
- **Stop siren** silences audio immediately, closes the popups and acknowledges
  the snapshot you saw (`throughId`); a genuinely newer alarm that arrived in the
  same instant still rings. Dismissing one popup acknowledges only that alarm.
  Dismissals are retried while offline and the stopped alarms stay muted on the
  device even if the network never confirms them.
- The siren is a continuous, loud two-carrier wail. **Mute siren / Enable siren**
  and a 20–100 % **volume** slider are remembered per account and browser; the
  **Test continuous siren** button proves the sound without creating an alert.
  Browsers require one tap before audio can start, so a "Sound is blocked" button
  appears until audio is unlocked.
- In-app popups need **no** browser notification permission. Granting
  notifications only adds a native OS popup per new alarm; it is a convenience,
  never a requirement, and muting the siren does not disable it.

### Optional AI verification (Groq)

Set a key to have a stronger multimodal model double-check every *new* track:

```bash
# .env.local
GROQ_API_KEY=gsk_…
# optional
GROQ_VISION_MODEL=qwen/qwen3.8-27b
GROQ_TIMEOUT_MS=4500
```

- One downscaled JPEG per confirmed track is sent (never a video stream).
- The call runs in Next.js `after()`, so ingest returns immediately.
- The verdict can refine the species (e.g. `cow` → `wild boar`) and mark the row
  **AI verified**. A refuted detection is **not** deleted: its alarm is kept for
  human review with an "AI could not confirm" message, and it is never
  auto-acknowledged. A high-confidence on-device person that Groq disagrees with
  stays as on-device evidence for you to judge.
- Missing key, HTTP error or timeout → silently skipped; on-device labels stand.

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
5. **Walk through frame** — the laptop shows a **Person** box, a movement trail,
   confidence and direction. After ~1 second the track is confirmed and a
   notification popup slides in with a continuous high-pitched siren.
6. **Sound the alarm** — the siren loops until a human taps **Stop siren**, or
   tap **Mute siren** in the alarm settings to silence it. Walk in again later
   — there is no cooldown, so a new track rings again. Point out that vehicles
   and random motion are ignored.
7. **Show the field context** — the phone GPS links the camera to the nearest
   mapped field (distance + compass direction) and live weather at the camera.
8. **Close the loop** — satellites mapped the land; the camera sees who and what
   moves on it. No synthetic alerts.

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
| AI badge stuck on “Loading AI…” | First load downloads ~6 MB of model weights. Detection starts as soon as it finishes; check the network or let it finish. |
| Detection feed misses people | Tracks need 3 hits (or 2 at high confidence) — one fast pass through the frame is not enough. |
| A car/bike drives past and nothing happens | By design: only humans and animals are tracked. |
| No alarm banner | Alarms appear only for confirmed tracks. Check `/api/camera/alerts` (`unread`) and that the page is signed in. Alarms persist until you press **Stop siren**. |
| Siren is silent | Tap anywhere once, or press **Sound is blocked — tap to start the loud siren** (browsers require a user gesture); check the **Siren volume** slider, the phone/OS volume and that the tab is not muted. Browser notifications also need permission, but in-app popups do not. |
| Alarm says “Needs human review” | The AI could not confirm the detection. The alarm is kept so you can judge it yourself; it is never acknowledged automatically. |
| Alarm says “AI verified” but species looks generic | That means Groq agreed with the on-device label. If `GROQ_API_KEY` is unset there is no badge and labels stay on-device. |
| Boxes offset from the video | The stored frame aspect ratio is used for the player; refresh the page. On a real phone the frame is 16:9/4:3 and aligns automatically. |
| Phone GPS not shared | Allow location for the site; some browsers require HTTPS (use the tunnel). |

---

## 6. Data model

Camera tables (migrations `0002`, `0004`):

- **`camera_sessions`** — owner, pairing token, status, device label, GPS, latest
  JPEG, frame dimensions, current overlay detections, motion, counters and
  timestamps.
- **`camera_detections`** — one row per newly *confirmed* human/animal track:
  label, emoji, category, confidence, track id, box, direction, speed, GPS,
  `confirmed`, `source` (`on-device` / `groq`) and `verified`.
- **`camera_alerts`** — one row per alarm: label, emoji, category, confidence,
  message, source, verified, GPS, `acknowledged_at`. The dashboard polls unread
  alarms; acknowledging hides the banner without deleting history.

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
POST   /api/camera/stream/:token       multipart: meta + frame       (token)
POST   /api/camera/stream/:token       { frame, detections, lat, lng } (legacy JSON)
GET    /api/camera/alerts              ?all=1 for history            (auth)
POST   /api/camera/alerts              { "id": 12 } | { "all": true } (auth)
GET    /api/camera/network                                           (auth)
```

`meta` is the JSON payload (`frameWidth`, `frameHeight`, `detections`, `lat`,
`lng`, `quality`, …) and `frame` is the raw JPEG blob. The ingest response
returns `newDetections`, `newAlerts` and `verificationQueued`; the phone uses the
first two to show how many events were logged and to raise its own toast.
