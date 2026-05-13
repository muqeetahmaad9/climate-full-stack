import bisect
from app.db.mongo import yearly_stats_col

# District grid built from yearly_stats centroids.
# Used by /summary, /stats, and /climate (with fixed tolerance for weather_data bbox).
_district_grid: list[tuple[float, float]] = []
_grid_sorted:   list[tuple[float, float]] = []  # alias for health endpoint


async def init_grid_cache() -> None:
    global _district_grid, _grid_sorted

    pipeline = [
        {"$group": {"_id": {"latitude": "$latitude", "longitude": "$longitude"}}},
        {"$project": {"_id": 0, "latitude": "$_id.latitude", "longitude": "$_id.longitude"}},
    ]
    docs = await yearly_stats_col().aggregate(pipeline).to_list(None)
    _district_grid = sorted(
        (float(d["latitude"]), float(d["longitude"])) for d in docs
    )
    _grid_sorted = _district_grid


def _nearest(
    lat: float, lon: float, tol: float, grid: list[tuple[float, float]]
) -> tuple[float, float, float]:
    if not grid:
        return lat, lon, tol

    lo = bisect.bisect_left(grid,  (lat - tol, float("-inf")))
    hi = bisect.bisect_right(grid, (lat + tol, float("inf")))

    best: tuple[float, float] | None = None
    best_d2 = float("inf")
    for glat, glon in grid[lo:hi]:
        if abs(glon - lon) > tol:
            continue
        d2 = (glat - lat) ** 2 + (glon - lon) ** 2
        if d2 < best_d2:
            best_d2, best = d2, (glat, glon)

    if best:
        return best[0], best[1], max(0.1, best_d2 ** 0.5 + 0.05)
    return lat, lon, tol


def nearest_grid(lat: float, lon: float, tol: float = 2.0) -> tuple[float, float, float]:
    """Nearest district centroid — used for /summary and /stats."""
    return _nearest(lat, lon, tol, _district_grid)


def nearest_weather_grid(lat: float, lon: float, tol: float = 2.0) -> tuple[float, float, float]:
    """For /climate daily queries — returns district centroid with fixed 0.5° tolerance
    so the bbox catches the nearest NASA POWER grid point without over-fetching."""
    nlat, nlon, _ = _nearest(lat, lon, tol, _district_grid)
    return nlat, nlon, 0.5
