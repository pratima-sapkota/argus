import asyncio
import base64
import json

from google import genai
from google.genai import types

from app.config import settings

GEMINI_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"

_client = genai.Client(api_key=settings.GOOGLE_API_KEY)

_LIVE_CONFIG = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
        )
    ),
)


class GeminiSession:
    def __init__(self):
        self._cm = None
        self._session = None

    async def __aenter__(self) -> "GeminiSession":
        self._cm = _client.aio.live.connect(model=GEMINI_MODEL, config=_LIVE_CONFIG)
        self._session = await self._cm.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._cm is not None:
            await self._cm.__aexit__(exc_type, exc_val, exc_tb)

    async def send_audio(self, pcm16_base64: str) -> None:
        raw = base64.b64decode(pcm16_base64)
        await self._session.send_realtime_input(
            audio=types.Blob(data=raw, mime_type="audio/pcm;rate=16000")
        )

    async def receive_audio_loop(self, websocket) -> None:
        while True:
            try:
                async for msg in self._session.receive():
                    if msg.data:
                        b64 = base64.b64encode(msg.data).decode()
                        await websocket.send_text(
                            json.dumps({"type": "audio", "data": b64})
                        )
                    if msg.server_content and msg.server_content.interrupted:
                        await websocket.send_text(json.dumps({"type": "interrupted"}))
                        break
                    if msg.server_content and msg.server_content.turn_complete:
                        await websocket.send_text(json.dumps({"type": "turn_complete"}))
                        break
            except Exception:
                break
