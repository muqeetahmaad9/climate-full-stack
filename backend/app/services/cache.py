"""
Redis-backed response cache with transparent in-memory fallback.

Usage:
    await init_cache(redis_uri)   # call on startup
    await close_cache()           # call on shutdown

    value = await cache_get(key)
    await cache_set(key, value)
    await cache_delete(key)
    is_redis_connected()          # True when Redis is live
"""

import json
import time
import logging
from typing import Any

_log = logging.getLogger(__name__)

_TTL = 3600  # default 1-hour TTL


# ── In-memory fallback ────────────────────────────────────────────────────────

class _TTLCache:
    def __init__(self, ttl: int = _TTL) -> None:
        self._store: dict = {}
        self._ttl = ttl

    def get(self, key: str) -> Any:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        self._store[key] = (value, time.monotonic() + self._ttl)

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()


_fallback = _TTLCache()
_redis = None   # redis.asyncio.Redis, set by init_cache()


# ── Lifecycle ─────────────────────────────────────────────────────────────────

async def init_cache(redis_uri: str) -> None:
    global _redis
    try:
        import redis.asyncio as aioredis
        client = aioredis.from_url(
            redis_uri,
            decode_responses=True,
            socket_connect_timeout=3,
        )
        await client.ping()
        _redis = client
        _log.info("Redis cache connected: %s", redis_uri)
    except Exception as exc:
        _log.warning("Redis unavailable (%s) — using in-memory cache fallback", exc)
        _redis = None


async def close_cache() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None
        _log.info("Redis cache disconnected")


# ── Public API ────────────────────────────────────────────────────────────────

def is_redis_connected() -> bool:
    return _redis is not None


async def cache_get(key: str) -> Any:
    if _redis:
        try:
            raw = await _redis.get(key)
            return json.loads(raw) if raw is not None else None
        except Exception as exc:
            _log.warning("Redis GET failed (%s), using fallback", exc)
    return _fallback.get(key)


async def cache_set(key: str, value: Any, ttl: int = _TTL) -> None:
    if _redis:
        try:
            await _redis.setex(key, ttl, json.dumps(value, default=str))
            return
        except Exception as exc:
            _log.warning("Redis SET failed (%s), using fallback", exc)
    _fallback.set(key, value)


async def cache_delete(key: str) -> None:
    if _redis:
        try:
            await _redis.delete(key)
        except Exception:
            pass
    _fallback.delete(key)


async def cache_clear() -> None:
    if _redis:
        try:
            await _redis.flushdb()
        except Exception:
            pass
    _fallback.clear()
