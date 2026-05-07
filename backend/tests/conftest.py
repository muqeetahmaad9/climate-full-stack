"""
Shared pytest fixtures.
- Mocks MongoDB so tests run without a live server.
- Clears the in-memory rate-limiter window before every test.
"""
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


# ── Reset rate-limiter between tests ─────────────────────────────────────────
# The limiter stores timestamps in a module-level dict that survives across tests.
# Without this, tests beyond the 5th auth call all get 429.

@pytest.fixture(autouse=True)
def reset_rate_limiter():
    from app.middleware.rate_limit import _windows
    _windows.clear()
    yield
    _windows.clear()


# ── Mock MongoDB for the whole session ────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def mock_mongo_session():
    """Replace Motor client with lightweight mocks — no live MongoDB needed."""

    def make_col():
        col = MagicMock()
        col.find_one     = AsyncMock(return_value=None)
        col.insert_one   = AsyncMock(return_value=MagicMock(inserted_id="test-id"))
        col.replace_one  = AsyncMock()
        col.delete_one   = AsyncMock()
        col.find         = MagicMock(return_value=MagicMock(
            to_list=AsyncMock(return_value=[]),
            sort=MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[]))),
        ))
        col.aggregate    = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))
        col.create_index = AsyncMock()
        return col

    cols = {}

    mock_db = MagicMock()
    mock_db.__getitem__ = lambda self, k: cols.setdefault(k, make_col())
    mock_db.list_collection_names = AsyncMock(
        return_value=[
            "monthly_stats", "yearly_stats", "climate_normals",
            "tehsil_monthly_stats", "tehsil_yearly_stats", "tehsil_normals",
        ]
    )

    mock_client = MagicMock()
    mock_client.__getitem__ = lambda self, k: mock_db

    with patch("app.db.mongo._client",         mock_client), \
         patch("app.db.mongo.connect_mongo",   AsyncMock()), \
         patch("app.db.mongo.close_mongo",     AsyncMock()), \
         patch("app.db.mongo.get_mongo_db",    return_value=mock_db), \
         patch("app.db.sqlite.init_grid_cache", AsyncMock()), \
         patch("app.db.sqlite.nearest_grid",    return_value=(30.0, 70.0)):
        yield cols          # tests can grab cols["users"] etc. if needed


@pytest_asyncio.fixture
async def client(mock_mongo_session):
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
