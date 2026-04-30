from fastapi import APIRouter, Depends, Query
import aiosqlite
from app.db.sqlite import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limit import user_rate_limit
from app.services.data_utils import DAILY_COLS, rows_to_daily
from app.services.cache import response_cache
from app.config import settings

router = APIRouter(
    tags=["tehsil"],
    dependencies=[
        Depends(get_current_user),
        Depends(user_rate_limit(settings.rate_limit_db_query, "db")),
    ],
)

YEARLY_FIELDS = (
    "T2M", "T2M_MAX", "T2M_MIN", "T2M_MAX_PEAK", "T2M_MIN_PEAK",
    "PREC", "WS2M", "RH2M", "SOLAR", "EVAP", "PRES", "SPHU", "SNOW", "WMAX", "WDIR",
)

NORM_FIELDS = (
    "T2M_norm", "T2M_MAX_norm", "T2M_MIN_norm", "PREC_norm", "WS2M_norm",
    "RH2M_norm", "SOLAR_norm", "EVAP_norm", "PRES_norm", "SPHU_norm",
    "SNOW_norm", "WMAX_norm", "WDIR_norm",
)

NORM_KEYS = ("T2M", "T2M_MAX", "T2M_MIN", "PREC", "WS2M", "RH2M", "SOLAR",
             "EVAP", "PRES", "SPHU", "SNOW", "WMAX", "WDIR")


@router.get("/list")
async def tehsils(db: aiosqlite.Connection = Depends(get_db)):
    cached = response_cache.get("tehsils")
    if cached is not None:
        return cached
    async with db.execute(
        "SELECT DISTINCT tehsil, district, province, latitude, longitude "
        "FROM tehsil_monthly_stats ORDER BY tehsil"
    ) as cur:
        rows = await cur.fetchall()
    result = [dict(r) for r in rows]
    response_cache.set("tehsils", result)
    return result


@router.get("/summary")
async def tehsil_summary(
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    tehsil: str = Query(default=""),
    db: aiosqlite.Connection = Depends(get_db),
):
    tq = tehsil.strip()
    yr_sel = ", ".join(["year"] + list(YEARLY_FIELDS))
    nr_sel = "month, " + ", ".join(NORM_FIELDS)

    if tq:
        async with db.execute(
            f"SELECT {yr_sel} FROM tehsil_yearly_stats WHERE tehsil=? ORDER BY year", (tq,)
        ) as cur:
            yr = await cur.fetchall()
        async with db.execute(
            f"SELECT {nr_sel} FROM tehsil_normals WHERE tehsil=? ORDER BY month", (tq,)
        ) as cur:
            nr = await cur.fetchall()
        async with db.execute(
            "SELECT tehsil, district, province FROM tehsil_yearly_stats WHERE tehsil=? LIMIT 1", (tq,)
        ) as cur:
            info = await cur.fetchone()
    else:
        bbox = (lat - 0.2, lat + 0.2, lon - 0.2, lon + 0.2)
        async with db.execute(
            f"SELECT {yr_sel} FROM tehsil_yearly_stats "
            "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ORDER BY year",
            bbox,
        ) as cur:
            yr = await cur.fetchall()
        async with db.execute(
            f"SELECT {nr_sel} FROM tehsil_normals "
            "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ORDER BY month",
            bbox,
        ) as cur:
            nr = await cur.fetchall()
        async with db.execute(
            "SELECT tehsil, district, province FROM tehsil_yearly_stats "
            "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? LIMIT 1",
            bbox,
        ) as cur:
            info = await cur.fetchone()

    yearly = {f: [r[f] for r in yr] for f in YEARLY_FIELDS}
    yearly["years"] = [r["year"] for r in yr]

    normals = {"months": [r["month"] for r in nr]}
    for key, col in zip(NORM_KEYS, NORM_FIELDS):
        normals[key] = [r[col] for r in nr]

    return {
        "tehsil":   info["tehsil"]   if info else "",
        "district": info["district"] if info else "",
        "province": info["province"] if info else "",
        "yearly":   yearly,
        "normals":  normals,
    }


@router.get("/climate")
async def tehsil_climate(
    lat: float = Query(default=0.0),
    lon: float = Query(default=0.0),
    tehsil: str = Query(default=""),
    from_date: str = Query(default="", alias="from"),
    to_date: str = Query(default="", alias="to"),
    db: aiosqlite.Connection = Depends(get_db),
):
    tq = tehsil.strip()
    try:
        fi = int(from_date.replace("-", "")) if from_date else 0
        ti = int(to_date.replace("-", ""))   if to_date   else 99999999
    except ValueError:
        fi, ti = 0, 99999999

    if tq:
        async with db.execute(
            f"SELECT {DAILY_COLS} FROM weather_data "
            "WHERE tehsil=? AND date BETWEEN ? AND ? AND temp_mean_c > -999 ORDER BY date",
            (tq, fi, ti),
        ) as cur:
            rows = await cur.fetchall()
    else:
        async with db.execute(
            f"SELECT {DAILY_COLS} FROM weather_data "
            "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? "
            "AND date BETWEEN ? AND ? AND temp_mean_c > -999 ORDER BY date",
            (lat - 0.2, lat + 0.2, lon - 0.2, lon + 0.2, fi, ti),
        ) as cur:
            rows = await cur.fetchall()

    return {"data": rows_to_daily(rows)}


@router.get("/stats")
async def tehsil_stats(
    lat: float = Query(default=0.0),
    lon: float = Query(default=0.0),
    tehsil: str = Query(default=""),
    year: int | None = Query(default=None),
    db: aiosqlite.Connection = Depends(get_db),
):
    tq = tehsil.strip()
    if tq:
        if year:
            async with db.execute(
                "SELECT * FROM tehsil_yearly_stats WHERE tehsil=? AND year=? ORDER BY year",
                (tq, year),
            ) as cur:
                rows = await cur.fetchall()
        else:
            async with db.execute(
                "SELECT * FROM tehsil_yearly_stats WHERE tehsil=? ORDER BY year", (tq,)
            ) as cur:
                rows = await cur.fetchall()
    else:
        bbox = (lat - 0.2, lat + 0.2, lon - 0.2, lon + 0.2)
        if year:
            async with db.execute(
                "SELECT * FROM tehsil_yearly_stats "
                "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? AND year=? ORDER BY year",
                (*bbox, year),
            ) as cur:
                rows = await cur.fetchall()
        else:
            async with db.execute(
                "SELECT * FROM tehsil_yearly_stats "
                "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ORDER BY year",
                bbox,
            ) as cur:
                rows = await cur.fetchall()

    return [dict(r) for r in rows]


@router.get("/search")
async def tehsil_search(
    q: str = Query(default=""),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        "SELECT tehsil, district, province, latitude, longitude "
        "FROM tehsil_monthly_stats WHERE LOWER(tehsil) LIKE ? GROUP BY tehsil LIMIT 30",
        (f"%{q.strip().lower()}%",),
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]
