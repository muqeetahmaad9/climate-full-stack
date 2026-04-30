from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from bson import ObjectId

from app.models.user import UserCreate, UserLogin, UserOut, TokenResponse
from app.services.auth_service import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
)
from app.db.mongo import users_col, tokens_col

router = APIRouter(tags=["auth"])
_bearer = HTTPBearer()


def _user_out(doc: dict) -> UserOut:
    return UserOut(
        id=str(doc["_id"]),
        username=doc["username"],
        email=doc["email"],
        role=doc["role"],
        created_at=doc["created_at"],
    )


@router.post("/register", status_code=201)
async def register(body: UserCreate):
    if await users_col().find_one({"email": body.email}):
        raise HTTPException(400, "Email already registered")
    if await users_col().find_one({"username": body.username}):
        raise HTTPException(400, "Username already taken")

    doc = {
        "username":        body.username,
        "email":           body.email,
        "hashed_password": hash_password(body.password),
        "role":            "user",
        "is_active":       True,
        "created_at":      datetime.now(timezone.utc),
    }
    result = await users_col().insert_one(doc)
    doc["_id"] = result.inserted_id
    return {"message": "Registered successfully", "user": _user_out(doc)}


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    user = await users_col().find_one({"email": body.email})
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(401, "Invalid email or password")
    if not user.get("is_active", True):
        raise HTTPException(403, "Account is disabled")

    token_data = {
        "sub":   str(user["_id"]),
        "email": user["email"],
        "role":  user["role"],
    }
    access  = create_access_token(token_data)
    refresh = create_refresh_token(token_data)

    await tokens_col().insert_one({
        "user_id":    str(user["_id"]),
        "token":      refresh,
        "created_at": datetime.now(timezone.utc),
    })

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=_user_out(user),
    )


@router.post("/refresh")
async def refresh(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    try:
        payload = decode_token(creds.credentials)
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
    except JWTError:
        raise HTTPException(401, "Invalid or expired refresh token")

    stored = await tokens_col().find_one({"token": creds.credentials})
    if not stored:
        raise HTTPException(401, "Refresh token revoked or not found")

    new_access = create_access_token({
        "sub":   payload["sub"],
        "email": payload["email"],
        "role":  payload["role"],
    })
    return {"access_token": new_access, "token_type": "bearer"}


@router.post("/logout")
async def logout(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    await tokens_col().delete_one({"token": creds.credentials})
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserOut)
async def me(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    try:
        payload = decode_token(creds.credentials)
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")

    user = await users_col().find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(404, "User not found")
    return _user_out(user)
