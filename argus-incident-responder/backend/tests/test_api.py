"""Tests for FastAPI HTTP endpoints."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health(self, async_client):
        resp = await async_client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestIncidentEndpoints:
    @pytest.mark.asyncio
    async def test_create_incident(self, async_client):
        fake = {"id": "inc-1", "title": "Test", "status": "active", "created_at": "2025-01-01", "closed_at": None, "summary": None}
        with patch("app.main.create_incident", new_callable=AsyncMock, return_value=fake):
            resp = await async_client.post("/incidents", json={"title": "Test"})
        assert resp.status_code == 201
        assert resp.json()["id"] == "inc-1"

    @pytest.mark.asyncio
    async def test_create_incident_missing_title(self, async_client):
        resp = await async_client.post("/incidents", json={})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_list_incidents(self, async_client):
        fake = [{"id": "inc-1", "title": "Test", "status": "active"}]
        with patch("app.main.list_incidents", new_callable=AsyncMock, return_value=fake):
            resp = await async_client.get("/incidents")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @pytest.mark.asyncio
    async def test_get_incident_found(self, async_client):
        fake = {"id": "inc-1", "title": "Test", "status": "active"}
        with patch("app.main.get_incident", new_callable=AsyncMock, return_value=fake):
            resp = await async_client.get("/incidents/inc-1")
        assert resp.status_code == 200
        assert resp.json()["id"] == "inc-1"

    @pytest.mark.asyncio
    async def test_get_incident_not_found(self, async_client):
        with patch("app.main.get_incident", new_callable=AsyncMock, return_value=None):
            resp = await async_client.get("/incidents/inc-999")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_close_incident(self, async_client):
        fake = {"id": "inc-1", "title": "Test", "status": "closed", "closed_at": "2025-01-01T00:00:00"}
        with patch("app.main.close_incident", new_callable=AsyncMock, return_value=fake):
            resp = await async_client.patch("/incidents/inc-1", json={"summary": "Done"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "closed"

    @pytest.mark.asyncio
    async def test_close_incident_not_found(self, async_client):
        with patch("app.main.close_incident", new_callable=AsyncMock, return_value="not_found"):
            resp = await async_client.patch("/incidents/inc-1", json={})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_close_incident_already_closed(self, async_client):
        with patch("app.main.close_incident", new_callable=AsyncMock, return_value="already_closed"):
            resp = await async_client.patch("/incidents/inc-1", json={})
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_get_transcripts_not_found(self, async_client):
        with patch("app.main.get_incident", new_callable=AsyncMock, return_value=None):
            resp = await async_client.get("/incidents/inc-999/transcripts")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_findings_not_found(self, async_client):
        with patch("app.main.get_incident", new_callable=AsyncMock, return_value=None):
            resp = await async_client.get("/incidents/inc-999/findings")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_all_incidents(self, async_client):
        with patch("app.main.delete_all_incidents", new_callable=AsyncMock, return_value=3):
            resp = await async_client.delete("/incidents")
        assert resp.status_code == 200
        assert resp.json() == {"deleted": 3}


class TestFirewallMiddleware:
    @pytest.mark.asyncio
    async def test_blocked_device_gets_403(self, async_client):
        with patch("app.main.is_blocked", new_callable=AsyncMock, return_value=True):
            resp = await async_client.get("/simulate-traffic", params={"device_id": "10.0.0.1"})
        assert resp.status_code == 403
        assert "Access Denied" in resp.json()["error"]

    @pytest.mark.asyncio
    async def test_exempt_paths_bypass_firewall(self, async_client):
        with patch("app.main.is_blocked", new_callable=AsyncMock, return_value=True):
            resp = await async_client.get("/health")
        assert resp.status_code == 200
