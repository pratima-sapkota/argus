import asyncio
import json
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.gemini import GeminiSession

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


@app.get("/health")
async def health():
    return {"status": "ok"}


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
