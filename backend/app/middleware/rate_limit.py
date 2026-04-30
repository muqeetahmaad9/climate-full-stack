"""
Sliding-window rate limiter backed by MongoDB.

Algorithm (O(log N) per request with compound index on (key, created_at)):
  1. Count docs for this key within the last `window_seconds`
  2. If count >= limit → 429
  3. Otherwise insert a new doc (TTL index purges it after 60 s automatically)

Two flavours:
  - user_rate_limit(limit, prefix)  → keyed by JWT user ID  (authenticated routes)
  - ip_rate_limit(limit)            → keyed by client IP     (auth endpoints)
"""

from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, Request
from app.db.mongo import rate_limits_col
from app.middleware.auth import get_current_user


async def _check(key: str, limit: int, window_seconds: int = 60) -> None:
    col = rate_limits_col()
    window_start = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
    try:
        count = await col.count_documents({"key": key, "created_at": {"$gte": window_start}})
        if count >= limit:
            raise HTTPException(
                status_code=429,
                detail={
                    "error":   "Rate limit exceeded",
                    "limit":   limit,
                    "window":  f"{window_seconds}s",
                    "message": f"Max {limit} requests per {window_seconds}s. Try again shortly.",
                },
            )
        await col.insert_one({"key": key, "created_at": datetime.now(timezone.utc)})
    except HTTPException:
        raise
    except Exception:
        # Fail open: if MongoDB is unreachable, allow the request
        pass


def user_rate_limit(limit: int, prefix: str, window_seconds: int = 60):
    """Returns a FastAPI dependency that rate-limits per authenticated user."""
    async def _dep(user: dict = Depends(get_current_user)):
        await _check(f"{prefix}:{user['sub']}", limit, window_seconds)
    return _dep


def ip_rate_limit(limit: int, window_seconds: int = 60):
    """Returns a FastAPI dependency that rate-limits per client IP."""
    async def _dep(request: Request):
        ip = request.client.host if request.client else "unknown"
        await _check(f"ip:{ip}", limit, window_seconds)
    return _dep
