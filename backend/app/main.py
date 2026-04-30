from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.db.sqlite import init_grid_cache
from app.db.mongo import connect_mongo, close_mongo
from app.routes import weather, tehsil, ai_proxy, auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_mongo()
    await init_grid_cache()
    yield
    await close_mongo()


app = FastAPI(
    title="PakClim API",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth.router,      prefix="/api/auth")
app.include_router(weather.router,   prefix="/api/weather")
app.include_router(tehsil.router,    prefix="/api/tehsil")
app.include_router(ai_proxy.router,  prefix="/api/ai")


@app.get("/health", tags=["system"])
async def health():
    from app.db.sqlite import _grid_cache
    import aiosqlite
    from app.config import settings

    tables: set[str] = set()
    try:
        async with aiosqlite.connect(settings.sqlite_db_path) as db:
            async with db.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ) as cur:
                rows = await cur.fetchall()
        tables = {r[0] for r in rows}
    except Exception:
        pass

    district_ready = {"monthly_stats", "yearly_stats", "climate_normals"}.issubset(tables)
    tehsil_ready   = {"tehsil_monthly_stats", "tehsil_yearly_stats", "tehsil_normals"}.issubset(tables)

    return {
        "status":        "ok",
        "server":        "PakClim FastAPI v3.0",
        "db":            settings.sqlite_db_path,
        "grid_points":   len(_grid_cache) if _grid_cache else 0,
        "district_ready": district_ready,
        "tehsil_ready":   tehsil_ready,
    }
