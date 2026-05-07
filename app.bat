@echo off
title PakClim Launcher
color 0A

echo.
echo  ================================================
echo    PakClim - Starting All Services
echo  ================================================
echo.

:: Step 1: MongoDB 7.0
echo  [1/3] MongoDB...
tasklist /FI "IMAGENAME eq mongod.exe" 2>NUL | find /I "mongod.exe" >NUL
if %ERRORLEVEL%==0 (
    echo        Already running - skipping.
) else (
    start "MongoDB 7.0" /MIN C:\data\mongod.exe --dbpath C:\data\db --wiredTigerCacheSizeGB 0.25
    echo        Waiting for MongoDB to be ready...
    timeout /t 7 /nobreak >NUL
)

:: Step 2: FastAPI Backend
echo  [2/3] FastAPI Backend  ^(port 8000^)...
set BAT_DIR=%~dp0
start "PakClim Backend" cmd /k "cd /d "%BAT_DIR%backend" && set MONGO_URI=mongodb://localhost:27017 && set JWT_SECRET=pakclim_ndma_weatherlens_secret_key_2024_xK9mP3qR7vL2nW8 && set JWT_EXPIRE_MINUTES=60 && set JWT_REFRESH_EXPIRE_DAYS=7 && set RATE_LIMIT_AUTH=5 && set RATE_LIMIT_DB_QUERY=60 && set ENVIRONMENT=development && uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo        Waiting for backend to start...
timeout /t 10 /nobreak >NUL

:: Step 3: Next.js Frontend
echo  [3/3] Next.js Frontend  ^(port 3000^)...
start "PakClim Frontend" cmd /k "cd /d "%BAT_DIR%frontend" && set NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoibmVvYzIwMjMiLCJhIjoiY2x1aTBubHAwMjYzOTJqcGc2cGFhMHU2ciJ9.tFU9_qFCY02qCvfiPMPDUg && set NEXT_PUBLIC_API_URL=http://localhost:8000 && npm run dev"
echo        Waiting for frontend to compile...
timeout /t 15 /nobreak >NUL

:: Done
echo.
echo  ================================================
echo    All services are running!
echo  ================================================
echo.
echo    App      >>  http://localhost:3000
echo    API Docs >>  http://localhost:8000/docs
echo    Health   >>  http://localhost:8000/health
echo.
echo  Opening browser...
start "" http://localhost:3000
echo.
echo  3 windows are running in their own terminals.
echo  Close those windows to stop each service.
echo.
pause
