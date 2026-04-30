import aiosqlite
from typing import AsyncGenerator
from app.config import settings

_grid_cache: list[tuple[float, float]] | None = None


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    async with aiosqlite.connect(settings.sqlite_db_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA busy_timeout=60000")
        await db.execute("PRAGMA journal_mode=WAL")
        yield db


async def init_grid_cache() -> None:
    global _grid_cache
    async with aiosqlite.connect(settings.sqlite_db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT DISTINCT latitude, longitude FROM weather_data"
        ) as cur:
            rows = await cur.fetchall()
    _grid_cache = [(float(r["latitude"]), float(r["longitude"])) for r in rows]


def nearest_grid(
    lat: float, lon: float, tol: float = 2.0
) -> tuple[float, float, float]:
    pts = _grid_cache or []
    best, best_d2 = None, float("inf")
    for glat, glon in pts:
        if abs(glat - lat) > tol or abs(glon - lon) > tol:
            continue
        d2 = (glat - lat) ** 2 + (glon - lon) ** 2
        if d2 < best_d2:
            best_d2, best = d2, (glat, glon)
    if best:
        return best[0], best[1], max(0.1, best_d2**0.5 + 0.05)
    return lat, lon, tol
