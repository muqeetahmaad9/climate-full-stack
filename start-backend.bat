@echo off
echo Starting PakClim Backend...
cd /d "%~dp0backend"
set MONGO_URI=mongodb://localhost:27017/pakclim
set JWT_SECRET=pakclim_ndma_weatherlens_secret_key_2024_xK9mP3qR7vL2nW8
set JWT_EXPIRE_MINUTES=60
set JWT_REFRESH_EXPIRE_DAYS=7
set RATE_LIMIT_LIVE_API=30
set RATE_LIMIT_NASA_API=10
set RATE_LIMIT_DB_QUERY=60
set RATE_LIMIT_AUTH=5
set SQLITE_DB_PATH=C:\Users\HP\Desktop\pakclim\data\weather_data.db
set ENVIRONMENT=development
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
