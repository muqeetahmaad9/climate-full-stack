"""
Auth route tests — unit (password/JWT) + integration (HTTP endpoints).
MongoDB is mocked via conftest.py; rate limiter is reset before each test.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.auth_service import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
)


# ── Unit: password hashing ────────────────────────────────────────────────────

class TestPasswordHashing:
    def test_hash_is_not_plaintext(self):
        assert hash_password("secret123") != "secret123"

    def test_correct_password_verifies(self):
        assert verify_password("mypassword", hash_password("mypassword")) is True

    def test_wrong_password_fails(self):
        assert verify_password("wrongpass", hash_password("mypassword")) is False

    def test_empty_password_hashes(self):
        assert verify_password("", hash_password("")) is True


# ── Unit: JWT ─────────────────────────────────────────────────────────────────

class TestJWT:
    def test_access_token_round_trip(self):
        payload = {"sub": "u1", "email": "a@b.com", "role": "user"}
        decoded = decode_token(create_access_token(payload))
        assert decoded["sub"]  == "u1"
        assert decoded["type"] == "access"

    def test_refresh_token_round_trip(self):
        payload = {"sub": "u2", "email": "x@y.com", "role": "user"}
        decoded = decode_token(create_refresh_token(payload))
        assert decoded["sub"]  == "u2"
        assert decoded["type"] == "refresh"

    def test_access_and_refresh_tokens_differ(self):
        p = {"sub": "u1", "email": "e@e.com", "role": "user"}
        assert create_access_token(p) != create_refresh_token(p)


# ── Helpers ───────────────────────────────────────────────────────────────────

REGISTER = {"username": "testuser", "email": "test@pakclim.io", "password": "StrongPass1"}
LOGIN    = {"email": "test@pakclim.io", "password": "StrongPass1"}

def fake_user(active=True):
    return {
        "_id": "uid-1", "username": "testuser",
        "email": "test@pakclim.io",
        "hashed_pw": hash_password("StrongPass1"),
        "role": "user", "is_active": active,
        "created_at": "2024-01-01T00:00:00",
    }


# ── Integration: register ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_success(client):
    with patch("app.routes.auth.users_col") as col:
        col.return_value.find_one   = AsyncMock(return_value=None)
        col.return_value.insert_one = AsyncMock(return_value=MagicMock(inserted_id="uid-1"))
        resp = await client.post("/api/auth/register", json=REGISTER)

    assert resp.status_code == 201
    assert resp.json()["user"]["username"] == "testuser"


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    with patch("app.routes.auth.users_col") as col:
        col.return_value.find_one = AsyncMock(return_value=fake_user())
        resp = await client.post("/api/auth/register", json=REGISTER)

    assert resp.status_code == 400
    assert "already registered" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_register_short_password_rejected(client):
    resp = await client.post("/api/auth/register", json={
        "username": "user1", "email": "a@b.com", "password": "short"
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_short_username_rejected(client):
    resp = await client.post("/api/auth/register", json={
        "username": "ab", "email": "a@b.com", "password": "validpass1"
    })
    assert resp.status_code == 422


# ── Integration: login ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_success(client):
    with patch("app.routes.auth.users_col") as uc, \
         patch("app.routes.auth.tokens_col") as tc:
        uc.return_value.find_one    = AsyncMock(return_value=fake_user())
        tc.return_value.replace_one = AsyncMock()
        resp = await client.post("/api/auth/login", json=LOGIN)

    assert resp.status_code == 200
    body = resp.json()
    assert "access_token"  in body
    assert "refresh_token" in body
    assert body["user"]["email"] == "test@pakclim.io"


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    with patch("app.routes.auth.users_col") as col:
        col.return_value.find_one = AsyncMock(return_value=fake_user())
        resp = await client.post("/api/auth/login", json={
            "email": "test@pakclim.io", "password": "BadPassword"
        })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_user_not_found(client):
    with patch("app.routes.auth.users_col") as col:
        col.return_value.find_one = AsyncMock(return_value=None)
        resp = await client.post("/api/auth/login", json=LOGIN)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_inactive_account(client):
    with patch("app.routes.auth.users_col") as col:
        col.return_value.find_one = AsyncMock(return_value=fake_user(active=False))
        resp = await client.post("/api/auth/login", json=LOGIN)
    assert resp.status_code == 403


# ── Integration: refresh ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_success(client):
    refresh = create_refresh_token({"sub": "uid-1", "email": "t@t.com", "role": "user"})
    with patch("app.routes.auth.tokens_col") as col:
        col.return_value.find_one = AsyncMock(return_value={"token": refresh})
        resp = await client.post("/api/auth/refresh",
                                 headers={"Authorization": f"Bearer {refresh}"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_refresh_revoked_token(client):
    refresh = create_refresh_token({"sub": "uid-1", "email": "t@t.com", "role": "user"})
    with patch("app.routes.auth.tokens_col") as col:
        col.return_value.find_one = AsyncMock(return_value=None)
        resp = await client.post("/api/auth/refresh",
                                 headers={"Authorization": f"Bearer {refresh}"})
    assert resp.status_code == 401


# ── Integration: logout ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_logout_success(client):
    refresh = create_refresh_token({"sub": "uid-1", "email": "t@t.com", "role": "user"})
    with patch("app.routes.auth.tokens_col") as col:
        col.return_value.delete_one = AsyncMock()
        resp = await client.post("/api/auth/logout",
                                 headers={"Authorization": f"Bearer {refresh}"})
    assert resp.status_code == 200
    assert "Logged out" in resp.json()["message"]


# ── Integration: /me ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_me_returns_profile(client):
    token = create_access_token({"sub": "uid-1", "email": "test@pakclim.io", "role": "user"})
    with patch("app.routes.auth.users_col") as col:
        col.return_value.find_one = AsyncMock(return_value=fake_user())
        resp = await client.get("/api/auth/me",
                                headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "test@pakclim.io"


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code in (401, 403)   # HTTPBearer raises 403 on missing header
