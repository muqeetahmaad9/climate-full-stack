from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from app.services.auth_service import decode_token
from app.logger import get_logger

_bearer = HTTPBearer()
_log = get_logger(__name__)


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    try:
        payload = decode_token(creds.credentials)
        if payload.get("type") != "access":
            _log.warning("Auth rejected: wrong token type")
            raise HTTPException(401, "Invalid token type")
        return payload
    except JWTError:
        _log.warning("Auth rejected: invalid or expired JWT")
        raise HTTPException(401, "Invalid or expired token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    return user
