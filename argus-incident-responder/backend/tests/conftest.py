import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "test-project")

# Create a real-ish GoogleCloudError so except clauses work
class _FakeGoogleCloudError(Exception):
    pass


_mock_gcp_exceptions = MagicMock()
_mock_gcp_exceptions.GoogleCloudError = _FakeGoogleCloudError

_mock_firestore_module = MagicMock()
_mock_firestore_module.AsyncClient.return_value = MagicMock()
_mock_firestore_module.SERVER_TIMESTAMP = "SERVER_TIMESTAMP"

_mock_bigquery_module = MagicMock()

_mock_genai = MagicMock()

sys.modules.setdefault("google.cloud.firestore", _mock_firestore_module)
sys.modules.setdefault("google.cloud.firestore_v1", MagicMock())
sys.modules.setdefault("google.cloud.bigquery", _mock_bigquery_module)
sys.modules.setdefault("google.cloud.exceptions", _mock_gcp_exceptions)
sys.modules.setdefault("google.genai", _mock_genai)
sys.modules.setdefault("google.genai.types", MagicMock())
sys.modules.setdefault("firebase_admin", MagicMock())

from app.config import db  # noqa: E402
from app.main import app  # noqa: E402
from app import tools as tools_module  # noqa: E402

from httpx import ASGITransport, AsyncClient  # noqa: E402

FakeGoogleCloudError = _FakeGoogleCloudError


@pytest.fixture(autouse=True)
def _reset_mocks():
    db.reset_mock()
    yield


@pytest.fixture
def mock_db():
    return db


@pytest.fixture
def mock_bq():
    bq = MagicMock()
    original = tools_module._bq_client
    tools_module._bq_client = bq
    yield bq
    tools_module._bq_client = original


@pytest.fixture
def async_client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")
