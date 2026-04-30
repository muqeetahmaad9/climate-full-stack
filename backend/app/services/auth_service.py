from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def _make_token(data: dict, token_type: str, expires: timedelta) -> str:
    payload = {
        **data,
        "type": token_type,
        "exp":  datetime.now(timezone.utc) + expires,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_access_token(data: dict) -> str:
    return _make_token(data, "access", timedelta(minutes=settings.jwt_expire_minutes))


def create_refresh_token(data: dict) -> str:
    return _make_token(data, "refresh", timedelta(days=settings.jwt_refresh_expire_days))


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
