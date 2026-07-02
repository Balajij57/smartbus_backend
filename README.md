# SmartBUS Traking — Real-Time Bus Monitoring System

A production-style school/college transport system built with a React + Vite frontend and an Express + MongoDB backend. The system uses the **driver’s Android mobile GPS** as the live location source — no external GPS hardware required.

---

## 1) System Architecture

### High-level flow
1. **Driver logs in** on mobile and taps **Start Trip**.
2. Browser/mobile geolocation starts streaming GPS coordinates every **10–15 seconds**.
3. Frontend sends coordinates to `POST /api/trips/:tripId/location`.
4. Backend stores live points in **MongoDB** (`liveLocations`) and updates active trip state (`tripHistory`).
5. Backend calculates:
   - current village reached
   - next village
   - route progress
   - remaining distance
   - ETA to next village / college
6. Backend broadcasts updates through **Socket.IO**.
7. **Parent** and **Student** dashboards receive and render updates in real time on **Leaflet + OpenStreetMap**.
8. If a student scans QR at the **authorized scanner**, the parent receives **SMS + in-app notification**.

### Real-time subsystems
- **GPS source:** Driver mobile browser (`navigator.geolocation.watchPosition`)
- **Map engine:** Leaflet + OpenStreetMap (free)
- **Realtime transport:** Socket.IO
- **Persistence:** MongoDB (route/vehicle/trip/location history)
- **Fallback mode:** browser mock backend (for demos if backend is unavailable)

---

## 2) Folder Structure

```text
.
├── backend/
│   ├── .env
│   ├── server.js
│   ├── sms.js
│   └── src/
│       ├── config/
│       │   ├── db.js
│       │   └── socket.js
│       ├── controllers/
│       │   └── trackingController.js
│       ├── models/
│       │   ├── Bus.js
│       │   ├── Route.js
│       │   ├── LiveLocation.js
│       │   ├── Trip.js
│       │   └── TrackingEvent.js
│       ├── routes/
│       │   ├── trackingRoutes.js
│       │   └── metaRoutes.js
│       ├── services/
│       │   ├── trackingService.js
│       │   └── seedService.js
│       └── utils/
│           └── geo.js
├── src/
│   ├── App.tsx
│   ├── lib/
│   │   ├── api.ts
│   │   ├── auth.tsx
│   │   ├── socket.ts
│   │   ├── geo.ts
│   │   ├── mockBackend.ts
│   │   ├── trackingMock.ts
│   │   └── uuid.ts
│   ├── components/
│   │   ├── DashboardLayout.tsx
│   │   ├── ui.tsx
│   │   ├── CameraQRScanner.tsx
│   │   └── tracking/
│   │       ├── BusStatusCard.tsx
│   │       ├── ETAWidget.tsx
│   │       ├── LiveLocationSender.tsx
│   │       ├── LiveMap.tsx
│   │       ├── LiveRouteMap.tsx
│   │       ├── RouteProgress.tsx
│   │       ├── StartTrip.tsx
│   │       ├── StopTrip.tsx
│   │       ├── TrackBus.tsx
│   │       └── VillageTracker.tsx
│   └── pages/
│       ├── Home.tsx
│       ├── Login.tsx
│       ├── Scanner.tsx
│       ├── StudentDashboard.tsx
│       ├── ParentDashboard.tsx
│       ├── DriverDashboard.tsx
│       └── AdminDashboard.tsx
└── vite.config.ts
```

---

## 3) MongoDB Collections / Schemas

### `buses`
```js
{
  busId,
  busNumber,
  routeId,
  driverId,
  status,            // inactive | active | paused
  currentTripId,
  currentVillageId,
  nextVillageId,
  lastKnownLocation: { latitude, longitude, speed, heading, timestamp }
}
```

### `routes`
```js
{
  routeId,
  routeName,
  collegeLocation: { name, latitude, longitude },
  villages: [
    { villageId, villageName, latitude, longitude, sequence, radiusMeters, kind }
  ]
}
```

### `liveLocations`
```js
{
  busId,
  tripId,
  latitude,
  longitude,
  speed,
  heading,
  source: 'driver-mobile',
  timestamp
}
```

### `tripHistory` (`Trip` model)
```js
{
  tripId,
  busId,
  driverId,
  routeId,
  startTime,
  endTime,
  status,              // active | completed
  routeProgress: [
    { villageId, villageName, sequence, crossed, crossedAt, status }
  ],
  totalDistanceKm,
  remainingDistanceKm,
  currentSpeedKmph,
  currentLocation,
  lastUpdatedAt,
  summary: { averageSpeedKmph, maxSpeedKmph, villagesCrossed, durationMinutes }
}
```

### `trackingEvents`
```js
{
  tripId,
  busId,
  kind,      // trip-started | village-crossed | offline | reconnected | trip-stopped
  title,
  message,
  payload,
  timestamp
}
```

---

## 4) Backend Tracking APIs

### Trip lifecycle
- `POST /api/trips/start`
- `POST /api/trips/:tripId/stop`
- `POST /api/trips/:tripId/location`

### Tracking read APIs
- `GET /api/tracking/bus/:busId/current`
- `GET /api/tracking/bus/:busId/progress`
- `GET /api/tracking/bus/:busId/eta`
- `GET /api/tracking/bus/:busId/villages`
- `GET /api/tracking/bus/:busId/snapshot`
- `GET /api/trips/history/:busId`

### Metadata
- `GET /api/tracking/meta/buses`
- `GET /api/tracking/meta/routes/:routeId`

### Existing business APIs retained
- auth / change password
- students CRUD
- drivers CRUD
- bus assignment
- alerts + SMS
- QR scan + SMS

---

## 5) Route Progress / Village Crossing Algorithm

The backend uses a configurable **radius check** (default **250m**) to determine whether the bus has reached a village.

### Logic
1. Load the active trip and route villages sorted by sequence.
2. Find the **nearest pending village**.
3. Compute distance using the **Haversine formula**.
4. If distance ≤ village radius:
   - mark village as **crossed**
   - set `crossedAt`
   - move next pending village to **current**
5. Recompute remaining distance along the route polyline.
6. Emit updated snapshot over Socket.IO.

### Visual status mapping
- `crossed` → 🟢 green
- `current` → 🟡 amber
- `pending` → ⚪ gray

---

## 6) ETA Calculation Logic

ETA is calculated using:
- latest GPS position
- distance to next village
- remaining distance to college
- current speed (with a safety fallback of `20 km/h` if speed is unavailable)

### Output
- `distanceRemainingKm`
- `etaToNextVillageMinutes`
- `etaToCollegeMinutes`
- human-friendly labels on frontend

---

## 7) Frontend Tracking Modules

### Driver
- Start Trip button
- Stop Trip button
- Live GPS sender (`watchPosition`)
- Current speed
- Current location
- Last updated time
- Offline detection / reconnect behavior
- Today’s boarded / dropped students
- Delay / Emergency alert flows
- Trip history summary

### Parent
- Live bus map
- Route progress
- ETA widget
- Today departure / drop-off / next village / trip status
- Driver details
- Notifications

### Student
- Live bus map
- Route progress
- ETA widget
- Assigned bus
- Today departure / drop-off / attendance
- Monthly boarding/drop-off log
- Personal QR code

### Scanner
- Real camera QR scanning
- Authorized scanner token
- Sends parent SMS on board/drop-off

---

## 8) Real-Time Updates (Socket.IO)

### Server emits
- `bus:location`
- `tracking:update`

### Client behavior
- Parent / Student join room: `bus:<busId>`
- Auto-reconnect enabled
- Polling fallback also present via REST for resilience

---

## 9) Environment Configuration

### Backend `.env`
```env
MONGO_URI=mongodb://localhost:27017/smartbus
PORT=5000
AUTHORIZED_SCANNERS=SCANNER_BUS12,SCANNER_BUS07,SCANNER_BUS03
NODE_ENV=development
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
DEFAULT_COUNTRY_CODE=+91
ADMIN_PHONE=
TRACKING_UPDATE_INTERVAL_SECONDS=15
VILLAGE_RADIUS_METERS=250
```

> The provided environment now matches the screenshot you shared.

---

## 10) Security Recommendations

1. Replace demo auth with hashed passwords using **bcrypt**.
2. Add **JWT access tokens** and route guards on all protected APIs.
3. Restrict driver location updates to authenticated driver sessions.
4. Validate scanner requests using signed tokens / device binding.
5. Rate-limit auth and scan endpoints.
6. Validate GPS payloads to block impossible jumps/spoofing.
7. Use HTTPS in production for geolocation and secure cookies.
8. Separate parent/admin notification visibility on the server side.
9. Store Twilio secrets only in environment variables / secret manager.

---

## 11) Scalability Recommendations

1. Move SMS + notifications to a queue (BullMQ / RabbitMQ) for high scale.
2. Keep only recent live location points hot; archive history to cold storage.
3. Use Redis for Socket.IO adapter if you scale horizontally.
4. Add a background worker for ETA recomputation / anomaly detection.
5. Add trip replay endpoints backed by indexed `liveLocations`.
6. Use MongoDB TTL / archiving policy for raw location points if needed.

---

## 12) Deployment Strategy

### Development
- Frontend: Vite
- Backend: Node/Express
- DB: MongoDB local or Atlas

### Production
- Frontend: Vercel / Netlify / static hosting
- Backend: Render / Railway / Fly.io / AWS / GCP VM
- MongoDB: Atlas
- Realtime: Socket.IO behind sticky sessions or Redis adapter
- Env secrets: platform secret manager

### Mobile/Driver notes
- Driver should open the system in Chrome on Android and keep GPS permission set to **Allow all the time** / **Precise location** while trip is active.
- For a production-grade driver experience, a React Native wrapper / PWA install is recommended later.

---

## 13) Current Status in This Project

### Implemented now
- MongoDB tracking models
- Tracking service layer
- Real-time tracking routes
- Socket.IO server bootstrap
- Leaflet/OpenStreetMap map components
- Driver GPS tracking UI using phone geolocation
- Parent & Student live map views
- Route progress & ETA widgets
- Scanner + SMS integration
- One-bus-one-driver enforcement

### Remaining recommended production upgrades
- Full JWT auth + bcrypt hashing
- Push notifications + background workers
- Historical route playback UI with scrubber/timeline
- Admin analytics dashboard for completed trips

---

## 14) Run the Project

### Frontend
```bash
npm install
npm run dev
```

### Backend
```bash
cd backend
npm install
npm start
```

If you want **real SMS**, configure Twilio values in `backend/.env`.

---

## 15) Note about ZIP file

I cannot directly generate/send a binary ZIP from this environment, but all required project files are now included in the workspace. You can zip locally with:

```bash
zip -r smartbus-tracking-system.zip . -x "node_modules/*" "backend/node_modules/*" "dist/*"
```
