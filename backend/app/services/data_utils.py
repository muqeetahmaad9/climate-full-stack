"""
Shared constants and helpers for converting MongoDB documents → API response dicts.
Single source of truth used by both weather.py and tehsil.py routes.
"""

DAILY_KEYS: tuple[str, ...] = (
    "T2M", "T2M_MAX", "T2M_MIN", "PREC", "WS2M", "RH2M",
    "SOLAR", "EVAP", "PRES", "SPHU", "SNOW", "WMAX", "WDIR",
)

DAILY_DB_COLS: tuple[str, ...] = (
    "temp_mean_c", "temp_max_c", "temp_min_c", "precipitation_mm",
    "windspeed_mean_2m_ms", "relative_humidity_pct", "solar_radiation_kwh_m2",
    "evapotranspiration_mm", "surface_pressure_kpa", "specific_humidity_g_kg",
    "snow_depth_cm", "windspeed_max_2m_ms", "wind_direction_deg",
)

# Pre-zipped once at import time — avoids re-zipping on every row conversion
_KEY_COL_PAIRS: tuple[tuple[str, str], ...] = tuple(zip(DAILY_KEYS, DAILY_DB_COLS))


def rows_to_daily(rows: list[dict]) -> dict:
    """
    Convert a list of MongoDB documents into a columnar dict.
    O(D) time and O(D) space where D = number of daily rows — optimal.
    Deduplicates by date (bbox queries can match multiple adjacent grid points).
    """
    data: dict = {"dates": [], **{k: [] for k in DAILY_KEYS}}
    dates = data["dates"]
    seen: set[str] = set()
    for r in rows:
        d = str(r["date"])
        if d in seen:
            continue
        seen.add(d)
        dates.append(d)
        for key, col in _KEY_COL_PAIRS:
            data[key].append(r[col])
    return data
