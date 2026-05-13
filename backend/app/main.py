from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.db.mongo import connect_mongo, close_mongo, get_mongo_db
from app.db.sqlite import init_grid_cache
from app.services.cache import init_cache, close_cache, is_redis_connected
from app.routes import weather, tehsil, ai_proxy, auth
from app.config import settings
from app.logger import setup_logging, get_logger

setup_logging()
_log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _log.info("PakClim API starting up")
    await connect_mongo()
    await init_grid_cache()
    await init_cache(settings.redis_uri)
    _log.info("Startup complete — MongoDB, Redis cache, and grid cache ready")
    yield
    _log.info("PakClim API shutting down")
    await close_cache()
    await close_mongo()


app = FastAPI(
    title="PakClim API",
    version="3.0.0",
    description="NDMA WeatherLens — 30-year Pakistan Climate Intelligence API",
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
    from app.db.sqlite import _grid_sorted

    db = get_mongo_db()
    collections = set(await db.list_collection_names())

    district_ready = {"monthly_stats", "yearly_stats", "climate_normals"}.issubset(collections)
    tehsil_ready   = {"tehsil_monthly_stats", "tehsil_yearly_stats", "tehsil_normals"}.issubset(collections)

    return {
        "status":         "ok",
        "server":         "PakClim FastAPI v3.0",
        "db":             "MongoDB",
        "cache":          "Redis" if is_redis_connected() else "in-memory",
        "grid_points":    len(_grid_sorted) if _grid_sorted else 0,
        "district_ready": district_ready,
        "tehsil_ready":   tehsil_ready,
    }
