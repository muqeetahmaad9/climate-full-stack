@echo off
echo Starting PakClim Frontend...
cd /d "%~dp0frontend"
set NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoibmVvYzIwMjMiLCJhIjoiY2x1aTBubHAwMjYzOTJqcGc2cGFhMHU2ciJ9.tFU9_qFCY02qCvfiPMPDUg
set BACKEND_URL=http://localhost:8000
set NODE_ENV=development
call npm run dev
pause
