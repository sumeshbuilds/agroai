# Event-driven security camera

The phone is the sensor. It runs COCO-SSD **on the device** at about **1 frame per
second**, sends a JPEG only when a confirmed animal is seen, and sends a tiny
heartbeat every 30 seconds. Continuous video is off by default; a dashboard can
request a **60-second Live Peek** over WebRTC.

This builds on the existing QR pairing, camera pages and dashboard. Nothing in
the pairing flow changed: open `/watch`, tap **Pair a phone**, scan the QR code,
allow camera + location, then tap **Start camera stream**.

## Rules implemented

| Rule | Value | Where |
| --- | --- | --- |
| Animal classes | `cow, horse, sheep, dog, bird, elephant, bear, zebra, giraffe, cat` | `src/lib/security-camera.ts` |
| Minimum confidence | `0.55` | `SECURITY_MIN_CONFIDENCE` |
| Alert cooldown | 15 s per camera | `SECURITY_ALERT_COOLDOWN_MS` |
| Inference cadence | 1 frame/s (0.5/s in Battery Saver) | `SECURITY_INFERENCE_MS` |
| Heartbeat | 30 s, includes battery level | `SECURITY_HEARTBEAT_MS` |
| Offline queue | newest 20 captures | `SECURITY_OFFLINE_QUEUE_LIMIT` |
| Offline retry | every 10 s and on `online` | `SECURITY_OFFLINE_RETRY_MS` |
| Device statuses | `offline`, `armed`, `live_peek` | `cameraDeviceStatus()` |
| Live Peek | 60 s, `stun:stun.l.google.com:19302` | `LIVE_PEEK_*` |

People are still tracked and drawn on the live overlay, but only **animals**
open the capture gate. The server keeps accepting person detections so older
clients and historical rows keep working.

## Data model

The running app uses **Neon Postgres + Drizzle** (not Supabase). The requested
names map onto the existing tables:

| Requested name | Existing table | Notes |
| --- | --- | --- |
| `camera_devices` | `camera_sessions` | adds `battery_level`, `last_heartbeat`, `pairing_expires_at`, `last_event_at`, `live_peek_until` |
| `intrusion_events` | `camera_alerts` | adds `image_data`, `image_url`, `captured_at` |
| Live Peek signalling | `camera_peek_sessions` | new table (offer, answer, expiry) |

Apply the Drizzle migration:

```bash
npm run db:generate   # already generated 0010_silent_wrecking_crew.sql
npm run db:migrate    # or apply drizzle/0010_silent_wrecking_crew.sql
```

If you deploy camera data to Supabase instead, run
[`sql/supabase-security-camera.sql`](sql/supabase-security-camera.sql). It creates
the exact `camera_devices` and `intrusion_events` tables, the private
`intrusion-captures` bucket, owner-only RLS policies and Realtime publication.
Upload evidence to `intrusion-captures/<auth.uid()>/<device_id>/<timestamp>.jpg`
and store that path in `intrusion_events.image_path`.

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/camera/stream/:token` | JPEG + detections (existing ingest) |
| `POST` | `/api/camera/stream/:token/heartbeat` | battery + status; returns a pending peek |
| `GET` | `/api/camera/stream/:token/peek` | phone polls for an SDP offer |
| `POST` | `/api/camera/stream/:token/peek` | phone writes its SDP answer |
| `POST` | `/api/camera/sessions/:id/peek` | dashboard creates an offer (60 s) |
| `GET` | `/api/camera/sessions/:id/peek?peekId=` | dashboard polls for the answer |
| `DELETE` | `/api/camera/sessions/:id/peek?peekId=` | stop the peek early |
| `GET` | `/api/camera/alerts/:id/image` | owner-only evidence JPEG |
| `GET` | `/api/camera/alerts?session=` | intrusion feed (optional per-camera filter) |

Video never passes through the server. Only the SDP offer/answer text is stored,
and those rows expire after 60 seconds.

## Phone behaviour

1. `getUserMedia` opens the rear camera at 1280×720.
2. COCO-SSD (`lite_mobilenet_v2` on slow links, otherwise `mobilenet_v2`) runs
   once per second on a 720 px canvas.
3. A confirmed animal at ≥ 55 % opens the capture gate. The 15-second cooldown is
   persisted in `localStorage` per camera, so a reload cannot spam alarms.
4. The JPEG is encoded once and posted as multipart. If the phone is offline, the
   same JPEG is stored in IndexedDB (`agroai-security`) and retried every 10 s
   and immediately on `online`. The queue keeps the newest 20 captures.
5. A 30-second heartbeat sends `armed` / `live_peek` / `offline`, battery level,
   device label and GPS. `pagehide` sends an `offline` beacon.
6. **Battery Saver / Dim Screen** dims the preview and halves the check rate.
7. A pending Live Peek offer arrives on the heartbeat or the 5-second peek poll;
   the phone answers with its existing stream and stops after 60 seconds.

## Dashboard behaviour

- The camera header shows `Armed`, `Offline` or `Live peek`, battery %, last-seen
  age and the last frame time.
- **Intrusion alerts** lists unresolved events with the evidence photo, label,
  confidence, capture time and **Mark Resolved**.
- **Live Peek (60s)** opens a peer-to-peer `<video>` with a visible countdown.
  Closing the dialog ends the server-side peek row immediately.

## Tests

Pure rules live in `src/lib/security-camera.ts` and are covered by
`tests/camera/security-camera.test.ts`:

```bash
npm test
npm run typecheck
npm run build
```

## Packages

The canonical install for this feature is:

```bash
npm install @tensorflow/tfjs @tensorflow-models/coco-ssd
```

This repository already ships the modular TensorFlow.js packages the detector
uses (`@tensorflow/tfjs-core`, `@tensorflow/tfjs-backend-webgl`,
`@tensorflow/tfjs-backend-cpu`, `@tensorflow/tfjs-converter`) plus
`@tensorflow-models/coco-ssd`, so no extra install is required.
