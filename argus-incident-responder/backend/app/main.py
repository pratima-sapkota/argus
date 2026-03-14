import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import FastAPI, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.cloud.firestore_v1 import Increment
from pydantic import BaseModel

from app.config import db
from app.gemini import GeminiSession
from app.firewall import is_blocked
from app.incidents import (
    close_incident,
    create_incident,
    get_findings,
    get_incident,
    get_transcripts,
    list_incidents,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Argus Incident Responder")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_EXEMPT_PATHS = {"/health", "/simulate-traffic", "/docs", "/openapi.json"}
_EXEMPT_PREFIXES = ("/incidents",)


class CreateIncidentBody(BaseModel):
    title: str


class CloseIncidentBody(BaseModel):
    summary: str | None = None


@app.middleware("http")
async def firewall_middleware(request: Request, call_next):
    if request.scope.get("type") == "websocket":
        return await call_next(request)
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path in _EXEMPT_PATHS or request.url.path.startswith(_EXEMPT_PREFIXES):
        return await call_next(request)
    device_id = request.query_params.get("device_id") or request.client.host
    if await is_blocked(device_id):
        return JSONResponse(
            status_code=403,
            content={"error": "Access Denied by Project Argus Firewall"},
        )
    return await call_next(request)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/simulate-traffic")
async def simulate_traffic(request: Request, device_id: str | None = None):
    resolved_id = device_id or request.client.host
    if await is_blocked(resolved_id):
        return JSONResponse(
            status_code=403,
            content={"error": "Access Denied by Project Argus Firewall"},
        )
    doc_ref = db.collection("active_connections").document(resolved_id)
    await doc_ref.set(
        {
            "device_id": resolved_id,
            "status": "ALLOWED",
            "last_seen": datetime.now(timezone.utc),
        },
        merge=True,
    )
    await doc_ref.update({"hits": Increment(1)})
    return {"device_id": resolved_id, "registered": True}


@app.post("/incidents", status_code=201)
async def create_incident_route(body: CreateIncidentBody):
    return await create_incident(body.title)


@app.get("/incidents")
async def list_incidents_route(status: str | None = None):
    return await list_incidents(status=status)


@app.get("/incidents/{incident_id}")
async def get_incident_route(incident_id: str):
    incident = await get_incident(incident_id)
    if not incident:
        return JSONResponse(status_code=404, content={"error": "Incident not found"})
    return incident


@app.get("/incidents/{incident_id}/transcripts")
async def get_transcripts_route(incident_id: str):
    incident = await get_incident(incident_id)
    if not incident:
        return JSONResponse(status_code=404, content={"error": "Incident not found"})
    return await get_transcripts(incident_id)


@app.get("/incidents/{incident_id}/findings")
async def get_findings_route(incident_id: str):
    incident = await get_incident(incident_id)
    if not incident:
        return JSONResponse(status_code=404, content={"error": "Incident not found"})
    return await get_findings(incident_id)


@app.patch("/incidents/{incident_id}")
async def close_incident_route(incident_id: str, body: CloseIncidentBody):
    result = await close_incident(incident_id, summary=body.summary)
    if result == "not_found":
        return JSONResponse(status_code=404, content={"error": "Incident not found"})
    if result == "already_closed":
        return JSONResponse(status_code=409, content={"error": "Incident already closed"})
    return result


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    incident_id: str = Query(default=None),
):
    if not incident_id:
        await websocket.close(code=4400)
        return
    incident = await get_incident(incident_id)
    if not incident:
        await websocket.close(code=4404)
        return
    if incident.get("status") != "active":
        await websocket.close(code=4403)
        return

    await websocket.accept()
    logger.info("Client connected — incident %s", incident_id)

    async with GeminiSession(incident_id=incident_id) as gemini:

        async def client_to_gemini():
            try:
                while True:
                    raw = await websocket.receive_text()
                    msg = json.loads(raw)
                    if msg.get("type") == "realtime_input":
                        for chunk in msg.get("media_chunks", []):
                            if chunk.get("data"):
                                await gemini.send_audio(chunk["data"])
            except WebSocketDisconnect:
                logger.info("Client disconnected")
            except Exception as e:
                logger.error("client_to_gemini error: %s", e)

        async def gemini_to_client():
            await gemini.receive_audio_loop(websocket)

        tasks = [
            asyncio.create_task(client_to_gemini()),
            asyncio.create_task(gemini_to_client()),
        ]
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass

    logger.info("Session closed")
