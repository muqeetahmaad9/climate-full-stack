"""
Weather route + rate-limiter tests.
get_current_user only decodes the JWT — no MongoDB lookup — so weather tests
just need a valid Bearer token in headers. No users_col patching required.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.auth_service import create_access_token


def auth_headers():
    token = create_access_token({"sub": "uid-1", "email": "u@t.com", "role": "user"})
    return {"Authorization": f"Bearer {token}"}


# ── /health (public) ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_ok(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db"]     == "MongoDB"


# ── Unauthenticated access ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_districts_requires_auth(client):
    resp = await client.get("/api/weather/districts")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_search_requires_auth(client):
    resp = await client.get("/api/weather/search?q=lahore")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_summary_requires_auth(client):
    resp = await client.get("/api/weather/summary?lat=30.0&lon=70.0&from=2020-01-01&to=2024-12-31")
    assert resp.status_code in (401, 403)


# ── Coordinate bounds validation ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_summary_rejects_lat_too_low(client):
    resp = await client.get(
        "/api/weather/summary?lat=10.0&lon=70.0&from=2020-01-01&to=2024-12-31",
        headers=auth_headers(),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_summary_rejects_lat_too_high(client):
    resp = await client.get(
        "/api/weather/summary?lat=50.0&lon=70.0&from=2020-01-01&to=2024-12-31",
        headers=auth_headers(),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_summary_rejects_lon_too_low(client):
    resp = await client.get(
        "/api/weather/summary?lat=30.0&lon=10.0&from=2020-01-01&to=2024-12-31",
        headers=auth_headers(),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_summary_rejects_lon_too_high(client):
    resp = await client.get(
        "/api/weather/summary?lat=30.0&lon=90.0&from=2020-01-01&to=2024-12-31",
        headers=auth_headers(),
    )
    assert resp.status_code == 400


# ── /districts ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_districts_returns_list(client):
    sample = [
        {"district": "Islamabad", "province": "Islamabad", "latitude": 33.7, "longitude": 73.1},
        {"district": "Lahore",    "province": "Punjab",    "latitude": 31.5, "longitude": 74.3},
    ]
    with patch("app.routes.weather.monthly_stats_col") as mc, \
         patch("app.services.cache.response_cache.get", return_value=None), \
         patch("app.services.cache.response_cache.set"):
        mc.return_value.aggregate = MagicMock(
            return_value=MagicMock(to_list=AsyncMock(return_value=sample))
        )
        resp = await client.get("/api/weather/districts", headers=auth_headers())

    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_districts_uses_cache(client):
    cached = [{"district": "Karachi", "province": "Sindh", "latitude": 24.8, "longitude": 67.0}]
    with patch("app.services.cache.response_cache.get", return_value=cached):
        resp = await client.get("/api/weather/districts", headers=auth_headers())

    assert resp.status_code == 200
    assert resp.json()[0]["district"] == "Karachi"


# ── /search ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_returns_results(client):
    sample = [{"district": "Islamabad", "province": "Islamabad",
               "latitude": 33.7, "longitude": 73.1}]
    with patch("app.routes.weather.monthly_stats_col") as mc:
        mc.return_value.aggregate = MagicMock(
            return_value=MagicMock(to_list=AsyncMock(return_value=sample))
        )
        resp = await client.get("/api/weather/search?q=islama", headers=auth_headers())

    assert resp.status_code == 200


# ── Rate limiter unit tests ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rate_limiter_blocks_after_limit():
    from app.middleware.rate_limit import _check, _windows

    key = "test:unit:block"
    _windows.pop(key, None)

    for _ in range(3):
        await _check(key, limit=3, window_seconds=60)

    with pytest.raises(Exception) as exc_info:
        await _check(key, limit=3, window_seconds=60)

    assert exc_info.value.status_code == 429
    _windows.pop(key, None)


@pytest.mark.asyncio
async def test_rate_limiter_resets_after_window():
    import time
    from app.middleware.rate_limit import _check, _windows

    key = "test:unit:window"
    _windows[key] = [time.monotonic() - 120]    # 2 min old — already expired

    # Should not raise (old entry pruned)
    await _check(key, limit=1, window_seconds=60)
    _windows.pop(key, None)


@pytest.mark.asyncio
async def test_rate_limiter_tracks_per_key():
    from app.middleware.rate_limit import _check, _windows

    key_a = "test:unit:key_a"
    key_b = "test:unit:key_b"
    _windows.pop(key_a, None)
    _windows.pop(key_b, None)

    # Fill up key_a
    for _ in range(2):
        await _check(key_a, limit=2, window_seconds=60)

    # key_b should still be clean
    await _check(key_b, limit=2, window_seconds=60)

    with pytest.raises(Exception) as exc_info:
        await _check(key_a, limit=2, window_seconds=60)

    assert exc_info.value.status_code == 429
    _windows.pop(key_a, None)
    _windows.pop(key_b, None)
