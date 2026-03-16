"""Tests for the firewall module."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.firewall import is_blocked


@pytest.fixture
def mock_doc():
    doc = AsyncMock()
    return doc


class TestIsBlocked:
    @pytest.mark.asyncio
    async def test_blocked_device(self, mock_db):
        doc = MagicMock()
        doc.exists = True
        doc.to_dict.return_value = {"status": "BLOCKED"}
        mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)

        assert await is_blocked("10.0.0.1") is True

    @pytest.mark.asyncio
    async def test_allowed_device(self, mock_db):
        doc = MagicMock()
        doc.exists = True
        doc.to_dict.return_value = {"status": "ALLOWED"}
        mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)

        assert await is_blocked("10.0.0.1") is False

    @pytest.mark.asyncio
    async def test_nonexistent_device(self, mock_db):
        doc = MagicMock()
        doc.exists = False
        mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)

        assert await is_blocked("unknown-device") is False

    @pytest.mark.asyncio
    async def test_device_with_no_status(self, mock_db):
        doc = MagicMock()
        doc.exists = True
        doc.to_dict.return_value = {}
        mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)

        assert await is_blocked("10.0.0.1") is False
