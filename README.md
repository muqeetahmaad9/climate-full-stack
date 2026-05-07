# PakClim — NDMA WeatherLens

A full-stack Pakistan Climate Intelligence Portal. Explore 30 years of NASA climate data for any district or settlement on an interactive satellite map, compare years, and get live current weather at settlement level.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Database | MongoDB 7.0 · Motor async driver |
| Backend | Python 3.11 · FastAPI · Uvicorn · Pydantic v2 |
| Auth | JWT (access + refresh tokens) · bcrypt |
| Frontend | Next.js 14 · React 18 · TypeScript |
| Map | Mapbox GL JS 3 · react-map-gl |
| Charts | Chart.js 4 · react-chartjs-2 |
| Live weather | Open-Meteo API (free, no key required) |
| Containers | Docker · Docker Compose |

---

## Features

- **Interactive satellite map** — Pakistan national, provincial, and district boundaries (all black outlines)
- **Settlement dots** — 14,988 sampled settlement points across Pakistan
- **Live weather popup** — click any settlement dot to fetch real-time weather from Open-Meteo
- **30-year climate data** — NASA POWER dataset stored in MongoDB; query by lat/lon + date range
- **6-tab side panel** — Climate · Yearly · Monthly · Compare · Explorer · Export
- **Trend arrows** — KPI cards show up/down vs 5-year historical average
- **Temperature heatmap calendar** — GitHub-style 52x7 day grid in Explorer tab
- **Moving chart crosshair** — vertical hairline + glowing dots follow mouse on all charts
- **Map search with fly-to** — search any district, smooth map animation on selection
- **JWT auth** — register, login, access + refresh token rotation
- **Rate limiting** — sliding-window: 5 req/min on auth (per IP), 60 req/min on data (per user)
- **Export** — Day-by-Day CSV, Yearly CSV, Monthly CSV, Raw JSON
- **Docker Compose** — one command starts all 3 services

---

## Quick Start

### Option A — One-click (Windows)

```bat
:: 1. Install Python deps (once)
cd backend
pip install -r requirements.txt

:: 2. Install Node deps (once)
cd frontend
npm install

:: 3. Double-click app.bat — opens browser automatically
```

### Option B — Manual terminals

```bash
# Terminal 1 — Backend
cd backend
pip install -r requirements.txt
set MONGO_URI=mongodb://localhost:27017
set JWT_SECRET=your_secret_key_here
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Frontend
cd frontend
npm install
set NEXT_PUBLIC_API_URL=http://localhost:8000
set NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
npm run dev
```

### Option C — Docker Compose

```bash
cp .env.example .env        # fill in secrets
docker compose up --build   # starts MongoDB + Backend + Frontend
docker compose down         # stop
```

**URLs once running:**

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |

---

## Project Structure

```
pakclim/
├── app.bat                        # One-click Windows launcher
├── docker-compose.yml
├── .env.example
│
├── backend/
│   ├── requirements.txt
│   ├── migrate_to_mongo.py        # One-shot SQLite to MongoDB migration
│   └── app/
│       ├── main.py                # FastAPI app, lifespan, middleware
│       ├── config.py              # Pydantic Settings
│       ├── db/
│       │   ├── mongo.py           # Motor client, indexes, collection accessors
│       │   └── sqlite.py          # In-memory spatial grid (O(log N) nearest-point)
│       ├── middleware/
│       │   ├── auth.py            # JWT bearer validation
│       │   └── rate_limit.py      # Sliding-window rate limiter (asyncio, no DB)
│       ├── routes/
│       │   ├── auth.py            # /api/auth
│       │   ├── weather.py         # /api/weather
│       │   ├── tehsil.py          # /api/tehsil
│       │   └── ai_proxy.py        # /api/ai
│       └── services/
│           ├── auth_service.py    # JWT creation, bcrypt hashing
│           ├── cache.py           # TTL in-memory response cache (1hr)
│           └── data_utils.py      # Shared column helpers
│
└── frontend/
    ├── package.json
    ├── app/
    │   ├── dashboard/page.tsx     # Main shell: map + topbar + panel
    │   ├── login/page.tsx
    │   ├── register/page.tsx
    │   └── globals.css            # Dark theme CSS design system
    ├── components/
    │   ├── map/PakistanMap.tsx    # Mapbox map, layers, live weather popup
    │   ├── panel/SidePanel.tsx    # 6-tab climate data panel
    │   ├── charts/ClimateCharts.tsx  # Chart.js charts + moving crosshair plugin
    │   └── ui/Topbar.tsx          # Search, logo, auth controls
    ├── context/AuthContext.tsx    # JWT state, auto-refresh loop
    ├── lib/
    │   ├── api.ts                 # All API call functions
    │   └── types.ts               # TypeScript interfaces
    └── public/geojson/            # GeoJSON boundary and settlement files
```

---

## API Reference

All data endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get access + refresh tokens |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Revoke refresh token |
| GET | `/api/auth/me` | Current user profile |
| GET | `/api/weather/districts` | All district names + coordinates |
| GET | `/api/weather/summary` | Yearly stats + monthly normals for a lat/lon |
| GET | `/api/weather/climate` | Full 30-year daily data stream |
| GET | `/api/weather/search?q=` | District name search |
| GET | `/api/tehsil/summary` | Tehsil-level climate summary |
| GET | `/health` | Service health + DB status |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `JWT_SECRET` | — | Secret key for JWT signing (required) |
| `JWT_EXPIRE_MINUTES` | `60` | Access token lifetime (minutes) |
| `JWT_REFRESH_EXPIRE_DAYS` | `7` | Refresh token lifetime (days) |
| `RATE_LIMIT_AUTH` | `5` | Auth requests/min per IP |
| `RATE_LIMIT_DB_QUERY` | `60` | Data requests/min per user |
| `ENVIRONMENT` | `development` | `development` or `production` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend URL for frontend |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | — | Mapbox public token (required) |

---

## MongoDB Collections

| Collection | Contents |
|---|---|
| `users` | User accounts (unique email + username) |
| `refresh_tokens` | JWT refresh token store |
| `weather_data` | Raw daily climate records (lat, lon, date, T2M, PREC, WS2M...) |
| `monthly_stats` | Pre-aggregated monthly averages per district |
| `yearly_stats` | Pre-aggregated yearly averages per district |
| `climate_normals` | 30-year climatological normals |
| `tehsil_monthly_stats` | Tehsil-level monthly aggregates |
| `tehsil_yearly_stats` | Tehsil-level yearly aggregates |
| `tehsil_normals` | Tehsil-level 30-year normals |

---

## Performance Design

- **O(log N) spatial lookup** — all grid points loaded into a sorted in-memory list at startup; `bisect` binary search finds the nearest climate grid point in microseconds
- **MongoDB compound indexes** — every query hits an index on `(latitude, longitude, date)`, `district`, or `year`
- **TTL response cache** — `/districts` and heavy aggregations cached 1 hour in-process
- **GZip compression** — all responses >= 1 KB compressed automatically
- **60fps crosshair** — native DOM `mousemove` + `requestAnimationFrame` throttle on all charts

---

## Running Tests

```bash
cd backend
pip install pytest pytest-asyncio httpx
pytest tests/ -v
```

---

## Git Workflow

```bash
git checkout -b feature/your-feature
# ... make changes ...
git add .
git commit -m "feat: description"
git push origin feature/your-feature
# Open PR into main
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Map blank / black | Check `NEXT_PUBLIC_MAPBOX_TOKEN` is set |
| Port 8000 in use | `netstat -ano \| findstr :8000` then `taskkill /PID <pid> /F` |
| Port 3000 in use | `netstat -ano \| findstr :3000` then `taskkill /PID <pid> /F` |
| Module not found (backend) | `pip install -r requirements.txt` |
| Cannot find module (frontend) | `npm install` inside `frontend/` |
| Docker no space left | `docker system prune -f` |
