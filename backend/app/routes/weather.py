from fastapi import APIRouter, Depends, HTTPException, Query

from app.db.mongo import monthly_stats_col, yearly_stats_col, climate_normals_col, weather_data_col
from app.db.sqlite import nearest_grid
from app.middleware.auth import get_current_user
from app.middleware.rate_limit import user_rate_limit
from app.services.data_utils import DAILY_DB_COLS, DAILY_KEYS, rows_to_daily
from app.services.cache import response_cache
from app.config import settings

router = APIRouter(
    tags=["weather"],
    dependencies=[
        Depends(get_current_user),
        Depends(user_rate_limit(settings.rate_limit_db_query, "db")),
    ],
)

PAK_LAT = (23.5, 37.5)
PAK_LON = (60.5, 78.5)

# MongoDB projection for daily weather rows — exclude _id only
_DAILY_PROJ = {"_id": 0}


def _check_coords(lat: float, lon: float) -> None:
    if not (PAK_LAT[0] <= lat <= PAK_LAT[1] and PAK_LON[0] <= lon <= PAK_LON[1]):
        raise HTTPException(400, "Coordinates outside Pakistan bounds")


def _bbox(nlat: float, nlon: float, ntol: float) -> dict:
    return {
        "latitude":  {"$gte": nlat - ntol, "$lte": nlat + ntol},
        "longitude": {"$gte": nlon - ntol, "$lte": nlon + ntol},
    }


@router.get("/districts")
async def districts():
    cached = response_cache.get("districts")
    if cached is not None:
        return cached
    pipeline = [
        {"$group": {"_id": {
            "district":  "$district",
            "province":  "$province",
            "latitude":  "$latitude",
            "longitude": "$longitude",
        }}},
        {"$project": {"_id": 0,
                      "district":  "$_id.district",
                      "province":  "$_id.province",
                      "latitude":  "$_id.latitude",
                      "longitude": "$_id.longitude"}},
        {"$sort": {"district": 1}},
    ]
    result = await monthly_stats_col().aggregate(pipeline).to_list(None)
    response_cache.set("districts", result)
    return result


@router.get("/summary")
async def summary(
    lat: float = Query(...),
    lon: float = Query(...),
    from_date: str = Query(default="", alias="from"),
    to_date: str = Query(default="", alias="to"),
):
    _check_coords(lat, lon)
    nlat, nlon, ntol = nearest_grid(lat, lon)
    flt = _bbox(nlat, nlon, ntol)
    year_start = int(from_date[:4]) if len(from_date) >= 4 and from_date[:4].isdigit() else 0
    year_end   = int(to_date[:4])   if len(to_date)   >= 4 and to_date[:4].isdigit()   else 9999

    yr = await yearly_stats_col().find(
        {**flt, "year": {"$gte": year_start, "$lte": year_end}},
        {"_id": 0},
    ).sort("year", 1).to_list(None)

    nr = await climate_normals_col().find(flt, {"_id": 0}).sort("month", 1).to_list(None)

    info = yr[0] if yr else {}

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
        "district": info.get("district", ""),
        "province": info.get("province", ""),
        "yearly":   yearly,
        "normals":  normals,
    }


@router.get("/climate")
async def climate(
    lat: float = Query(...),
    lon: float = Query(...),
    from_date: str = Query(default="", alias="from"),
    to_date: str = Query(default="", alias="to"),
):
    _check_coords(lat, lon)
    nlat, nlon, ntol = nearest_grid(lat, lon)
    flt = _bbox(nlat, nlon, ntol)

    if from_date and to_date:
        from_int = int(from_date.replace("-", ""))
        to_int   = int(to_date.replace("-", ""))
        rows = await weather_data_col().find(
            {**flt, "date": {"$gte": from_int, "$lte": to_int}, "temp_mean_c": {"$gt": -999}},
            _DAILY_PROJ,
        ).sort("date", 1).to_list(None)
        return {"data": rows_to_daily(rows)}

    rows = await climate_normals_col().find(flt, {"_id": 0}).sort("month", 1).to_list(None)
    return rows


@router.get("/stats")
async def stats(
    lat: float = Query(...),
    lon: float = Query(...),
    year: int | None = Query(default=None),
):
    nlat, nlon, ntol = nearest_grid(lat, lon)
    flt = _bbox(nlat, nlon, ntol)
    if year:
        flt["year"] = year
    rows = await yearly_stats_col().find(flt, {"_id": 0}).sort("year", 1).to_list(None)
    return rows


@router.get("/search")
async def search(q: str = Query(default="")):
    pipeline = [
        {"$match": {"district": {"$regex": q.strip(), "$options": "i"}}},
        {"$group": {"_id": "$district",
                    "province":  {"$first": "$province"},
                    "latitude":  {"$first": "$latitude"},
                    "longitude": {"$first": "$longitude"}}},
        {"$project": {"_id": 0,
                      "district":  "$_id",
                      "province":  1,
                      "latitude":  1,
                      "longitude": 1}},
        {"$limit": 20},
    ]
    return await monthly_stats_col().aggregate(pipeline).to_list(None)
