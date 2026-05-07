from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection
from app.config import settings

_client: AsyncIOMotorClient | None = None


async def connect_mongo() -> None:
    global _client
    _client = AsyncIOMotorClient(settings.mongo_uri)
    db = _client["pakclim"]

    # Auth indexes
    await db["users"].create_index("email", unique=True)
    await db["users"].create_index("username", unique=True)
    await db["refresh_tokens"].create_index("user_id")
    await db["refresh_tokens"].create_index("token", unique=True)

    # Rate limit indexes (TTL + compound)
    await db["rate_limits"].create_index("created_at", expireAfterSeconds=60)
    await db["rate_limits"].create_index([("key", 1), ("created_at", 1)])

    # Daily weather data — primary lookup pattern: bbox + date range
    await db["weather_data"].create_index([("latitude", 1), ("longitude", 1), ("date", 1)])
    await db["weather_data"].create_index("district")
    await db["weather_data"].create_index("tehsil")

    # District-level aggregate tables
    await db["monthly_stats"].create_index([("latitude", 1), ("longitude", 1)])
    await db["monthly_stats"].create_index("district")
    await db["yearly_stats"].create_index([("latitude", 1), ("longitude", 1), ("year", 1)])
    await db["yearly_stats"].create_index("district")
    await db["climate_normals"].create_index([("latitude", 1), ("longitude", 1), ("month", 1)])

    # Tehsil-level aggregate tables
    await db["tehsil_monthly_stats"].create_index([("latitude", 1), ("longitude", 1)])
    await db["tehsil_monthly_stats"].create_index("tehsil")
    await db["tehsil_yearly_stats"].create_index([("latitude", 1), ("longitude", 1), ("year", 1)])
    await db["tehsil_yearly_stats"].create_index("tehsil")
    await db["tehsil_normals"].create_index([("latitude", 1), ("longitude", 1)])
    await db["tehsil_normals"].create_index("tehsil")


async def close_mongo() -> None:
    global _client
    if _client:
        _client.close()
        _client = None


def get_mongo_db() -> AsyncIOMotorDatabase:
    return _client["pakclim"]


# ── Auth collections ──────────────────────────────────────────────────────────

def users_col() -> AsyncIOMotorCollection:
    return get_mongo_db()["users"]


def tokens_col() -> AsyncIOMotorCollection:
    return get_mongo_db()["refresh_tokens"]


def rate_limits_col() -> AsyncIOMotorCollection:
    return get_mongo_db()["rate_limits"]


# ── Weather data collections ──────────────────────────────────────────────────

def weather_data_col() -> AsyncIOMotorCollection:
    return get_mongo_db()["weather_data"]


def monthly_stats_col() -> AsyncIOMotorCollection:
    return get_mongo_db()["monthly_stats"]


def yearly_stats_col() -> AsyncIOMotorCollection:
    return get_mongo_db()["yearly_stats"]


def climate_normals_col() -> AsyncIOMotorCollection:
    return get_mongo_db()["climate_normals"]


def tehsil_monthly_stats_col() -> AsyncIOMotorCollection:
    return get_mongo_db()["tehsil_monthly_stats"]


def tehsil_yearly_stats_col() -> AsyncIOMotorCollection:
    return get_mongo_db()["tehsil_yearly_stats"]


def tehsil_normals_col() -> AsyncIOMotorCollection:
    return get_mongo_db()["tehsil_normals"]
