from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings

_client: AsyncIOMotorClient | None = None


async def connect_mongo() -> None:
    global _client
    _client = AsyncIOMotorClient(settings.mongo_uri)
    db = _client["pakclim"]
    await db["users"].create_index("email", unique=True)
    await db["users"].create_index("username", unique=True)
    await db["refresh_tokens"].create_index("user_id")
    await db["refresh_tokens"].create_index("token", unique=True)
    # TTL index: rate_limit docs auto-expire after 60 s (max window)
    await db["rate_limits"].create_index("created_at", expireAfterSeconds=60)
    # compound index for efficient per-key window count  O(log N)
    await db["rate_limits"].create_index([("key", 1), ("created_at", 1)])


async def close_mongo() -> None:
    global _client
    if _client:
        _client.close()
        _client = None


def get_mongo_db() -> AsyncIOMotorDatabase:
    return _client["pakclim"]


def users_col():
    return get_mongo_db()["users"]


def tokens_col():
    return get_mongo_db()["refresh_tokens"]


def rate_limits_col():
    return get_mongo_db()["rate_limits"]
