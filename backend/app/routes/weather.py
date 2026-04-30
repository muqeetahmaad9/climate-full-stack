from fastapi import APIRouter, Depends, HTTPException, Query
import aiosqlite
from app.db.sqlite import get_db, nearest_grid
from app.middleware.auth import get_current_user

router = APIRouter(tags=["weather"], dependencies=[Depends(get_current_user)])

PAK_LAT = (23.5, 37.5)
PAK_LON = (60.5, 78.5)

DAILY_COLS = (
    "date, temp_mean_c, temp_max_c, temp_min_c, precipitation_mm, "
    "windspeed_mean_2m_ms, relative_humidity_pct, solar_radiation_kwh_m2, "
    "evapotranspiration_mm, surface_pressure_kpa, specific_humidity_g_kg, "
    "snow_depth_cm, windspeed_max_2m_ms, wind_direction_deg"
)

DAILY_KEYS = ("T2M", "T2M_MAX", "T2M_MIN", "PREC", "WS2M", "RH2M",
              "SOLAR", "EVAP", "PRES", "SPHU", "SNOW", "WMAX", "WDIR")

DAILY_DB_COLS = ("temp_mean_c", "temp_max_c", "temp_min_c", "precipitation_mm",
                 "windspeed_mean_2m_ms", "relative_humidity_pct", "solar_radiation_kwh_m2",
                 "evapotranspiration_mm", "surface_pressure_kpa", "specific_humidity_g_kg",
                 "snow_depth_cm", "windspeed_max_2m_ms", "wind_direction_deg")


def _check_coords(lat: float, lon: float) -> None:
    if not (PAK_LAT[0] <= lat <= PAK_LAT[1] and PAK_LON[0] <= lon <= PAK_LON[1]):
        raise HTTPException(400, "Coordinates outside Pakistan bounds")


def _rows_to_daily(rows: list) -> dict:
    data: dict = {"dates": [], **{k: [] for k in DAILY_KEYS}}
    for r in rows:
        data["dates"].append(str(r["date"]))
        for key, col in zip(DAILY_KEYS, DAILY_DB_COLS):
            data[key].append(r[col])
    return data


@router.get("/districts")
async def districts(db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute(
        "SELECT DISTINCT district, province, latitude, longitude "
        "FROM monthly_stats ORDER BY district"
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.get("/summary")
async def summary(
    lat: float = Query(...),
    lon: float = Query(...),
    db: aiosqlite.Connection = Depends(get_db),
):
    _check_coords(lat, lon)
    nlat, nlon, ntol = nearest_grid(lat, lon)
    bounds = (nlat - ntol, nlat + ntol, nlon - ntol, nlon + ntol)

    async with db.execute("""
        SELECT year, T2M, T2M_MAX, T2M_MIN, T2M_MAX_PEAK, T2M_MIN_PEAK,
               PREC, WS2M, RH2M, SOLAR
        FROM yearly_stats
        WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
        ORDER BY year
    """, bounds) as cur:
        yr = await cur.fetchall()

    async with db.execute("""
        SELECT month, T2M_norm, T2M_MAX_norm, T2M_MIN_norm,
               PREC_norm, WS2M_norm, RH2M_norm, SOLAR_norm
        FROM climate_normals
        WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
        ORDER BY month
    """, bounds) as cur:
        nr = await cur.fetchall()

    async with db.execute("""
        SELECT district, province FROM yearly_stats
        WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
        LIMIT 1
    """, bounds) as cur:
        info = await cur.fetchone()

    yearly = {
        "years":        [r["year"]          for r in yr],
        "T2M":          [r["T2M"]           for r in yr],
        "T2M_MAX":      [r["T2M_MAX"]       for r in yr],
        "T2M_MIN":      [r["T2M_MIN"]       for r in yr],
        "T2M_MAX_PEAK": [r["T2M_MAX_PEAK"]  for r in yr],
        "T2M_MIN_PEAK": [r["T2M_MIN_PEAK"]  for r in yr],
        "PREC":         [r["PREC"]          for r in yr],
        "WS2M":         [r["WS2M"]          for r in yr],
        "RH2M":         [r["RH2M"]          for r in yr],
        "SOLAR":        [r["SOLAR"]         for r in yr],
    }

    normals = {
        "months":  [r["month"]        for r in nr],
        "T2M":     [r["T2M_norm"]     for r in nr],
        "T2M_MAX": [r["T2M_MAX_norm"] for r in nr],
        "T2M_MIN": [r["T2M_MIN_norm"] for r in nr],
        "PREC":    [r["PREC_norm"]    for r in nr],
        "WS2M":    [r["WS2M_norm"]    for r in nr],
        "RH2M":    [r["RH2M_norm"]    for r in nr],
        "SOLAR":   [r["SOLAR_norm"]   for r in nr],
    }

    return {
        "district": info["district"] if info else "",
        "province": info["province"] if info else "",
        "yearly":   yearly,
        "normals":  normals,
    }


@router.get("/climate")
async def climate(
    lat: float = Query(...),
    lon: float = Query(...),
    from_date: str = Query(default="", alias="from"),
    to_date: str = Query(default="", alias="to"),
    db: aiosqlite.Connection = Depends(get_db),
):
    _check_coords(lat, lon)
    nlat, nlon, ntol = nearest_grid(lat, lon)
    bounds = (nlat - ntol, nlat + ntol, nlon - ntol, nlon + ntol)

    if from_date and to_date:
        from_int = int(from_date.replace("-", ""))
        to_int   = int(to_date.replace("-", ""))
        async with db.execute(
            f"SELECT {DAILY_COLS} FROM weather_data "
            "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? "
            "AND date BETWEEN ? AND ? AND temp_mean_c > -999 ORDER BY date",
            (*bounds, from_int, to_int),
        ) as cur:
            rows = await cur.fetchall()
        return {"data": _rows_to_daily(rows)}

    async with db.execute("""
        SELECT month, T2M_norm, T2M_MAX_norm, T2M_MIN_norm,
               PREC_norm, WS2M_norm, RH2M_norm, SOLAR_norm
        FROM climate_normals
        WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
        ORDER BY month
    """, bounds) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.get("/stats")
async def stats(
    lat: float = Query(...),
    lon: float = Query(...),
    year: int | None = Query(default=None),
    db: aiosqlite.Connection = Depends(get_db),
):
    nlat, nlon, ntol = nearest_grid(lat, lon)
    bounds = (nlat - ntol, nlat + ntol, nlon - ntol, nlon + ntol)

    if year:
        async with db.execute(
            "SELECT * FROM yearly_stats "
            "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? AND year = ? "
            "ORDER BY year",
            (*bounds, year),
        ) as cur:
            rows = await cur.fetchall()
    else:
        async with db.execute(
            "SELECT * FROM yearly_stats "
            "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ORDER BY year",
            bounds,
        ) as cur:
            rows = await cur.fetchall()

    return [dict(r) for r in rows]


@router.get("/search")
async def search(
    q: str = Query(default=""),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        "SELECT district, province, latitude, longitude "
        "FROM monthly_stats WHERE LOWER(district) LIKE ? GROUP BY district LIMIT 20",
        (f"%{q.strip().lower()}%",),
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]
