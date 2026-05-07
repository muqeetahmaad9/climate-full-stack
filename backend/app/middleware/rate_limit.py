"""
In-memory sliding-window rate limiter — no database required.
"""

import asyncio
from collections import defaultdict
from time import monotonic
from fastapi import Depends, HTTPException, Request
from app.middleware.auth import get_current_user

_windows: dict[str, list[float]] = defaultdict(list)
_lock = asyncio.Lock()


async def _check(key: str, limit: int, window_seconds: int = 60) -> None:
    async with _lock:
        now = monotonic()
        cutoff = now - window_seconds
        entries = _windows[key]
        # Prune expired entries in-place
        _windows[key] = [t for t in entries if t > cutoff]
        if len(_windows[key]) >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Max {limit} requests per {window_seconds}s.",
            )
        _windows[key].append(now)


def user_rate_limit(limit: int, prefix: str, window_seconds: int = 60):
    async def _dep(user: dict = Depends(get_current_user)):
        await _check(f"{prefix}:{user['sub']}", limit, window_seconds)
    return _dep


def ip_rate_limit(limit: int, window_seconds: int = 60):
    async def _dep(request: Request):
        ip = request.client.host if request.client else "unknown"
        await _check(f"ip:{ip}", limit, window_seconds)
    return _dep
