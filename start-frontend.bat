@echo off
echo Starting PakClim Frontend...
cd /d "%~dp0frontend"
set NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_public_token_here
set BACKEND_URL=http://localhost:8000
set NODE_ENV=development
call npm run dev
pause
