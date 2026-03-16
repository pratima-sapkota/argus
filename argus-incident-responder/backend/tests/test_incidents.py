"""Tests for the incidents module."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.incidents import (
    close_incident,
    create_incident,
    get_incident,
    list_incidents,
)


def _mock_doc(doc_id, data, exists=True):
    doc = MagicMock()
    doc.id = doc_id
    doc.exists = exists
    doc.to_dict.return_value = data
    doc.reference = MagicMock()
    return doc


class TestCreateIncident:
    @pytest.mark.asyncio
    async def test_creates_incident(self, mock_db):
        doc_ref = MagicMock()
        doc_ref.id = "inc-123"
        mock_db.collection.return_value.add = AsyncMock(return_value=(None, doc_ref))

        result = await create_incident("Test Incident")

        assert result["id"] == "inc-123"
        assert result["title"] == "Test Incident"
        assert result["status"] == "active"
        assert result["closed_at"] is None
        assert result["summary"] is None
        assert "created_at" in result


class TestGetIncident:
    @pytest.mark.asyncio
    async def test_returns_incident(self, mock_db):
        doc = _mock_doc("inc-123", {"title": "Test", "status": "active"})
        mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)

        result = await get_incident("inc-123")

        assert result["id"] == "inc-123"
        assert result["title"] == "Test"

    @pytest.mark.asyncio
    async def test_returns_none_for_missing(self, mock_db):
        doc = _mock_doc("inc-999", None, exists=False)
        mock_db.collection.return_value.document.return_value.get = AsyncMock(return_value=doc)

        result = await get_incident("inc-999")

        assert result is None


class TestListIncidents:
    @pytest.mark.asyncio
    async def test_lists_all(self, mock_db):
        docs = [
            _mock_doc("inc-1", {"title": "First", "status": "active"}),
            _mock_doc("inc-2", {"title": "Second", "status": "closed"}),
        ]

        async def fake_stream():
            for d in docs:
                yield d

        query = MagicMock()
        query.stream = fake_stream
        query.limit.return_value = query
        query.where.return_value = query
        mock_db.collection.return_value.order_by.return_value = query

        result = await list_incidents()

        assert len(result) == 2
        assert result[0]["id"] == "inc-1"
        assert result[1]["id"] == "inc-2"


class TestCloseIncident:
    @pytest.mark.asyncio
    async def test_close_active_incident(self, mock_db):
        active_doc = _mock_doc("inc-1", {"title": "Test", "status": "active"})
        closed_doc = _mock_doc("inc-1", {"title": "Test", "status": "closed", "closed_at": "2025-01-01T00:00:00"})

        doc_ref = MagicMock()
        doc_ref.get = AsyncMock(side_effect=[active_doc, closed_doc])
        doc_ref.update = AsyncMock()
        mock_db.collection.return_value.document.return_value = doc_ref

        result = await close_incident("inc-1", summary="Resolved")

        assert result["status"] == "closed"
        doc_ref.update.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_close_missing_returns_not_found(self, mock_db):
        doc = _mock_doc("inc-999", None, exists=False)
        doc_ref = MagicMock()
        doc_ref.get = AsyncMock(return_value=doc)
        mock_db.collection.return_value.document.return_value = doc_ref

        result = await close_incident("inc-999")

        assert result == "not_found"

    @pytest.mark.asyncio
    async def test_close_already_closed(self, mock_db):
        doc = _mock_doc("inc-1", {"title": "Test", "status": "closed"})
        doc_ref = MagicMock()
        doc_ref.get = AsyncMock(return_value=doc)
        mock_db.collection.return_value.document.return_value = doc_ref

        result = await close_incident("inc-1")

        assert result == "already_closed"
