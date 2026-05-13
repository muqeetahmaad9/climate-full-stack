@echo off
title PakClim Launcher
color 0A
set BAT_DIR=%~dp0

:: ── Tool paths ────────────────────────────────────────────────────────────────
set PYTHON=C:\Users\hp\AppData\Local\Programs\Python\Python314\python.exe
set UVICORN=C:\Users\hp\AppData\Local\Programs\Python\Python314\Scripts\uvicorn.exe
set NODE_DIR=C:\Users\hp\nodejs
set PATH=%NODE_DIR%;C:\Users\hp\AppData\Local\Programs\Python\Python314;C:\Users\hp\AppData\Local\Programs\Python\Python314\Scripts;%PATH%

echo.
echo  ================================================
echo    PakClim  ^|  NDMA WeatherLens
echo  ================================================
echo.

:: ── [1/4] MongoDB ─────────────────────────────────────────────────────────────
echo  [1/4] MongoDB...
tasklist 2>NUL | find /I "mongod.exe" >NUL 2>&1
if %ERRORLEVEL%==0 (
    echo        Already running.
) else (
    start "MongoDB" /MIN "C:\data\mongod.exe" --dbpath "C:\data\db" --wiredTigerCacheSizeGB 0.25
    echo        Waiting 8s for MongoDB to start...
    timeout /t 8 /nobreak >NUL
)

:: ── [2/4] Redis (optional — app falls back to in-memory cache if unavailable) ─
echo  [2/4] Redis cache...
tasklist 2>NUL | find /I "redis-server.exe" >NUL 2>&1
if %ERRORLEVEL%==0 (
    echo        Already running.
) else (
    where redis-server >NUL 2>&1
    if %ERRORLEVEL%==0 (
        start "Redis" /MIN redis-server --port 6379
        echo        Waiting 3s for Redis to start...
        timeout /t 3 /nobreak >NUL
    ) else (
        echo        Redis not found — app will use in-memory cache fallback.
    )
)

:: ── [3/4] FastAPI backend ─────────────────────────────────────────────────────
echo  [3/4] FastAPI Backend (port 8000)...
set MONGO_URI=mongodb://localhost:27017
set REDIS_URI=redis://localhost:6379
set JWT_SECRET=pakclim_ndma_weatherlens_secret_key_2024_xK9mP3qR7vL2nW8
set JWT_EXPIRE_MINUTES=60
set JWT_REFRESH_EXPIRE_DAYS=7
set RATE_LIMIT_AUTH=5
set RATE_LIMIT_DB_QUERY=60
set ENVIRONMENT=development
start "PakClim Backend" cmd /k "cd /d "%BAT_DIR%backend" && "%UVICORN%" app.main:app --host 0.0.0.0 --port 8000"
echo        Waiting 12s for backend to start...
timeout /t 12 /nobreak >NUL

:: ── [4/4] Next.js frontend ────────────────────────────────────────────────────
echo  [4/4] Next.js Frontend (port 3000)...
set NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoibmVvYzIwMjMiLCJhIjoiY2x1aTBubHAwMjYzOTJqcGc2cGFhMHU2ciJ9.tFU9_qFCY02qCvfiPMPDUg
set NEXT_PUBLIC_API_URL=http://localhost:8000
start "PakClim Frontend" cmd /k "cd /d "%BAT_DIR%frontend" && npm run dev"
echo        Waiting 15s for frontend to start...
timeout /t 15 /nobreak >NUL

:: ── Done ──────────────────────────────────────────────────────────────────────
echo.
echo  ================================================
echo    All services running!
echo  ================================================
echo.
echo    App      :  http://localhost:3000
echo    API      :  http://localhost:8000
echo    Swagger  :  http://localhost:8000/docs
echo    Health   :  http://localhost:8000/health
echo.
start "" "http://localhost:3000"
pause
