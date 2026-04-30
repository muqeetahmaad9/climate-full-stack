import bisect
import aiosqlite
from typing import AsyncGenerator
from app.config import settings

# Grid sorted by (lat, lon) — enables O(log N + K) nearest lookup via bisect.
# K = number of points in the lat band, which is << N for Pakistan's grid.
_grid_sorted: list[tuple[float, float]] = []


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    async with aiosqlite.connect(settings.sqlite_db_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA busy_timeout=60000")
        await db.execute("PRAGMA journal_mode=WAL")
        yield db


async def init_grid_cache() -> None:
    global _grid_sorted
    async with aiosqlite.connect(settings.sqlite_db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT DISTINCT latitude, longitude FROM weather_data"
        ) as cur:
            rows = await cur.fetchall()
    _grid_sorted = sorted(
        (float(r["latitude"]), float(r["longitude"])) for r in rows
    )


def nearest_grid(
    lat: float, lon: float, tol: float = 2.0
) -> tuple[float, float, float]:
    """
    O(log N + K) nearest grid point lookup.
    Binary search narrows candidates to the lat band [lat-tol, lat+tol],
    then a linear scan over K candidates filters by lon.
    For Pakistan's ~1 000-point grid at tol=2.0, K ≈ 64  vs  N ≈ 1 000.
    """
    if not _grid_sorted:
        return lat, lon, tol

    # bisect on sorted list of (lat, lon) tuples uses lat as primary key
    lo = bisect.bisect_left(_grid_sorted,  (lat - tol, float("-inf")))
    hi = bisect.bisect_right(_grid_sorted, (lat + tol, float("inf")))

    best: tuple[float, float] | None = None
    best_d2 = float("inf")
    for glat, glon in _grid_sorted[lo:hi]:       # O(K) where K << N
        if abs(glon - lon) > tol:
            continue
        d2 = (glat - lat) ** 2 + (glon - lon) ** 2
        if d2 < best_d2:
            best_d2, best = d2, (glat, glon)

    if best:
        return best[0], best[1], max(0.1, best_d2 ** 0.5 + 0.05)
    return lat, lon, tol
