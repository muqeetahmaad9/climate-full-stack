import bisect
from app.db.mongo import weather_data_col

# Grid sorted by (lat, lon) — enables O(log N + K) nearest lookup via bisect.
_grid_sorted: list[tuple[float, float]] = []


async def init_grid_cache() -> None:
    global _grid_sorted
    pipeline = [
        {"$group": {"_id": {"latitude": "$latitude", "longitude": "$longitude"}}},
        {"$project": {"_id": 0, "latitude": "$_id.latitude", "longitude": "$_id.longitude"}},
    ]
    docs = await weather_data_col().aggregate(pipeline).to_list(None)
    _grid_sorted = sorted(
        (float(d["latitude"]), float(d["longitude"])) for d in docs
    )


def nearest_grid(
    lat: float, lon: float, tol: float = 2.0
) -> tuple[float, float, float]:
    """
    O(log N + K) nearest grid point lookup.
    Binary search narrows candidates to the lat band [lat-tol, lat+tol],
    then a linear scan over K candidates filters by lon.
    """
    if not _grid_sorted:
        return lat, lon, tol

    lo = bisect.bisect_left(_grid_sorted,  (lat - tol, float("-inf")))
    hi = bisect.bisect_right(_grid_sorted, (lat + tol, float("inf")))

    best: tuple[float, float] | None = None
    best_d2 = float("inf")
    for glat, glon in _grid_sorted[lo:hi]:
        if abs(glon - lon) > tol:
            continue
        d2 = (glat - lat) ** 2 + (glon - lon) ** 2
        if d2 < best_d2:
            best_d2, best = d2, (glat, glon)

    if best:
        return best[0], best[1], max(0.1, best_d2 ** 0.5 + 0.05)
    return lat, lon, tol
