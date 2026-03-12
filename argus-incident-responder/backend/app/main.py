import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.cloud.firestore_v1 import Increment

from app.config import db
from app.gemini import GeminiSession
from app.firewall import is_blocked

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


@app.middleware("http")
async def firewall_middleware(request: Request, call_next):
    if request.scope.get("type") == "websocket":
        return await call_next(request)
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path in _EXEMPT_PATHS:
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


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected")

    async with GeminiSession() as gemini:

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
