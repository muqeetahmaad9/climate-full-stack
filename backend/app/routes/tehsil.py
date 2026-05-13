import re

from fastapi import APIRouter, Depends, HTTPException, Query

from app.db.mongo import (
    tehsil_monthly_stats_col, tehsil_yearly_stats_col,
    tehsil_normals_col, weather_data_col,
)
from app.middleware.auth import get_current_user
from app.middleware.rate_limit import user_rate_limit
from app.services.data_utils import rows_to_daily
from app.services.cache import cache_get, cache_set
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

_DAILY_PROJ = {"_id": 0}


@router.get("/list")
async def tehsils():
    cached = await cache_get("tehsils")
    if cached is not None:
        return cached
    pipeline = [
        {"$group": {"_id": {
            "tehsil":    "$tehsil",
            "district":  "$district",
            "province":  "$province",
            "latitude":  "$latitude",
            "longitude": "$longitude",
        }}},
        {"$project": {"_id": 0,
                      "tehsil":    "$_id.tehsil",
                      "district":  "$_id.district",
                      "province":  "$_id.province",
                      "latitude":  "$_id.latitude",
                      "longitude": "$_id.longitude"}},
        {"$sort": {"tehsil": 1}},
    ]
    result = await tehsil_monthly_stats_col().aggregate(pipeline).to_list(None)
    await cache_set("tehsils", result)
    return result


@router.get("/summary")
async def tehsil_summary(
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    tehsil: str = Query(default=""),
):
    tq = tehsil.strip()
    proj_yr = {"_id": 0, "year": 1, "tehsil": 1, "district": 1, "province": 1,
               **{f: 1 for f in YEARLY_FIELDS}}
    proj_nr = {"_id": 0, "month": 1, **{f: 1 for f in NORM_FIELDS}}

    if tq:
        yr_raw = await tehsil_yearly_stats_col().find({"tehsil": tq}, proj_yr).sort("year", 1).to_list(None)
        nr_raw = await tehsil_normals_col().find({"tehsil": tq}, proj_nr).sort("month", 1).to_list(None)
    elif lat is None or lon is None:
        raise HTTPException(400, "Provide either 'tehsil' name or lat/lon coordinates")
    else:
        bbox = {
            "latitude":  {"$gte": lat - 0.2, "$lte": lat + 0.2},
            "longitude": {"$gte": lon - 0.2, "$lte": lon + 0.2},
        }
        yr_raw = await tehsil_yearly_stats_col().find(bbox, proj_yr).sort("year", 1).to_list(None)
        nr_raw = await tehsil_normals_col().find(bbox, proj_nr).sort("month", 1).to_list(None)

    yr = sorted({r["year"]: r for r in yr_raw}.values(), key=lambda r: r["year"])
    nr = sorted({r["month"]: r for r in nr_raw}.values(), key=lambda r: r["month"])

    info = yr[0] if yr else {}

    yearly = {f: [r.get(f) for r in yr] for f in YEARLY_FIELDS}
    yearly["years"] = [r["year"] for r in yr]

    normals = {"months": [r["month"] for r in nr]}
    for key, col in zip(NORM_KEYS, NORM_FIELDS):
        normals[key] = [r.get(col) for r in nr]

    return {
        "tehsil":   info.get("tehsil", ""),
        "district": info.get("district", ""),
        "province": info.get("province", ""),
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
):
    tq = tehsil.strip()
    try:
        fi = int(from_date.replace("-", "")) if from_date else 0
        ti = int(to_date.replace("-", ""))   if to_date   else 99999999
    except ValueError:
        fi, ti = 0, 99999999

    if tq:
        rows = await weather_data_col().find(
            {"tehsil": tq, "date": {"$gte": fi, "$lte": ti}, "temp_mean_c": {"$gt": -999}},
            _DAILY_PROJ,
        ).sort("date", 1).to_list(None)
    else:
        rows = await weather_data_col().find(
            {"latitude":  {"$gte": lat - 0.2, "$lte": lat + 0.2},
             "longitude": {"$gte": lon - 0.2, "$lte": lon + 0.2},
             "date": {"$gte": fi, "$lte": ti}, "temp_mean_c": {"$gt": -999}},
            _DAILY_PROJ,
        ).sort("date", 1).to_list(None)

    return {"data": rows_to_daily(rows)}


@router.get("/stats")
async def tehsil_stats(
    lat: float = Query(default=0.0),
    lon: float = Query(default=0.0),
    tehsil: str = Query(default=""),
    year: int | None = Query(default=None),
):
    tq = tehsil.strip()
    flt: dict = {}
    if tq:
        flt["tehsil"] = tq
    else:
        flt["latitude"]  = {"$gte": lat - 0.2, "$lte": lat + 0.2}
        flt["longitude"] = {"$gte": lon - 0.2, "$lte": lon + 0.2}
    if year:
        flt["year"] = year
    rows = await tehsil_yearly_stats_col().find(flt, {"_id": 0}).sort("year", 1).to_list(None)
    return rows


@router.get("/search")
async def tehsil_search(q: str = Query(default="")):
    pipeline = [
        {"$match": {"tehsil": {"$regex": re.escape(q.strip()), "$options": "i"}}},
        {"$group": {"_id": "$tehsil",
                    "district":  {"$first": "$district"},
                    "province":  {"$first": "$province"},
                    "latitude":  {"$first": "$latitude"},
                    "longitude": {"$first": "$longitude"}}},
        {"$project": {"_id": 0,
                      "tehsil":    "$_id",
                      "district":  1,
                      "province":  1,
                      "latitude":  1,
                      "longitude": 1}},
        {"$limit": 30},
    ]
    return await tehsil_monthly_stats_col().aggregate(pipeline).to_list(None)
