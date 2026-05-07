from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError

from app.models.user import UserCreate, UserLogin, UserOut, TokenResponse
from app.services.auth_service import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
)
from app.db.mongo import users_col, tokens_col
from app.middleware.rate_limit import ip_rate_limit
from app.config import settings
from app.logger import get_logger

_log = get_logger(__name__)

router = APIRouter(
    tags=["auth"],
    dependencies=[Depends(ip_rate_limit(settings.rate_limit_auth))],
)
_bearer = HTTPBearer()


def _doc_to_user(doc: dict) -> UserOut:
    return UserOut(
        id=doc["_id"],
        username=doc["username"],
        email=doc["email"],
        role=doc["role"],
        created_at=datetime.fromisoformat(doc["created_at"]),
    )


@router.post("/register", status_code=201)
async def register(body: UserCreate):
    if await users_col().find_one({"email": body.email}):
        _log.warning("Register rejected: email already exists (%s)", body.email)
        raise HTTPException(400, "Email already registered")
    if await users_col().find_one({"username": body.username}):
        _log.warning("Register rejected: username already exists (%s)", body.username)
        raise HTTPException(400, "Username already taken")

    uid        = str(uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    await users_col().insert_one({
        "_id":        uid,
        "username":   body.username,
        "email":      body.email,
        "hashed_pw":  hash_password(body.password),
        "role":       "user",
        "is_active":  True,
        "created_at": created_at,
    })

    _log.info("User registered: %s (%s)", body.username, body.email)
    user = UserOut(id=uid, username=body.username, email=body.email, role="user",
                   created_at=datetime.fromisoformat(created_at))
    return {"message": "Registered successfully", "user": user}


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    user = await users_col().find_one({"email": body.email})

    if not user or not verify_password(body.password, user["hashed_pw"]):
        _log.warning("Login failed: bad credentials for %s", body.email)
        raise HTTPException(401, "Invalid email or password")
    if not user["is_active"]:
        _log.warning("Login rejected: account disabled (%s)", body.email)
        raise HTTPException(403, "Account is disabled")

    token_data = {"sub": user["_id"], "email": user["email"], "role": user["role"]}
    access  = create_access_token(token_data)
    refresh = create_refresh_token(token_data)

    await tokens_col().replace_one(
        {"token": refresh},
        {"token": refresh, "user_id": user["_id"], "created_at": datetime.now(timezone.utc).isoformat()},
        upsert=True,
    )

    _log.info("Login success: %s (role=%s)", body.email, user["role"])
    return TokenResponse(access_token=access, refresh_token=refresh, user=_doc_to_user(user))


@router.post("/refresh")
async def refresh(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    try:
        payload = decode_token(creds.credentials)
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
    except JWTError:
        raise HTTPException(401, "Invalid or expired refresh token")

    if not await tokens_col().find_one({"token": creds.credentials}):
        raise HTTPException(401, "Refresh token revoked or not found")

    new_access = create_access_token({
        "sub": payload["sub"], "email": payload["email"], "role": payload["role"]
    })
    return {"access_token": new_access, "token_type": "bearer"}


@router.post("/logout")
async def logout(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    await tokens_col().delete_one({"token": creds.credentials})
    _log.info("User logged out (token revoked)")
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserOut)
async def me(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    try:
        payload = decode_token(creds.credentials)
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")

    user = await users_col().find_one({"_id": payload["sub"]})
    if not user:
        raise HTTPException(404, "User not found")
    return _doc_to_user(user)
