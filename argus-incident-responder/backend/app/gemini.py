import asyncio
import base64
import io
import json
import logging

from PIL import Image
from google import genai

logger = logging.getLogger(__name__)
from google.genai import types

from google.cloud import firestore

from app.config import db, settings
from app.incidents import add_finding
from app.tools import (
    block_device,
    filter_network_logs,
    get_active_connections,
    get_connection_details,
    get_connections_by_status,
    get_high_severity_threats,
    get_network_summary,
    get_traffic_by_port,
    unblock_device,
)

GEMINI_MODEL = "gemini-live-2.5-flash-native-audio"

_client = genai.Client(
    vertexai=True,
    project=settings.GOOGLE_CLOUD_PROJECT,
    location=settings.GOOGLE_CLOUD_LOCATION,
)

_SYSTEM_INSTRUCTION = (
    "You are Argus, an elite, military-precise Security Operations Center (SOC) AI assistant. "
    "Always respond in English only, regardless of the language of the user's input. "
    "You have direct access to live network telemetry via BigQuery and active firewall control. "
    "When an analyst asks about threats or port traffic, call the appropriate tool and report "
    "findings concisely: lead with the most critical data, use clear tactical language, "
    "and keep responses under 45 seconds of speech. Never speculate beyond the data returned. "
    "You can block a device or IP address using the block_device tool, and unblock a previously "
    "blocked device using the unblock_device tool, but ONLY when the analyst explicitly orders you "
    "to block or unblock. Never call block_device or unblock_device autonomously or proactively. "
    "After any tool call, always respond with a high-level summary only — never enumerate raw "
    "records, IPs, host names, or granular data in your response. The analyst has full visibility "
    "of the underlying data in the dashboard. Summarize what was found or actioned, highlight "
    "anything critical, and stop there."
)

_TOOL_DECLARATIONS = [
    {
        "function_declarations": [
            {
                "name": "get_high_severity_threats",
                "description": (
                    "Query network_logs for the most recent MALICIOUS threat entries. "
                    "Returns log_id, src_ip, dest_ip, dest_port, timestamp, and bytes "
                    "for the top N rows ordered by most recent first."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "limit": {
                            "type": "INTEGER",
                            "description": "Maximum number of malicious rows to return. Defaults to 5.",
                        }
                    },
                },
            },
            {
                "name": "filter_network_logs",
                "description": (
                    "Query network_logs with user-specified column filters. "
                    "All parameters are optional — combine any subset to narrow results. "
                    "Returns log_id, src_ip, dest_ip, dest_port, timestamp, bytes, and threat_intel_status "
                    "ordered by most recent first."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "src_ip": {
                            "type": "STRING",
                            "description": "Filter by exact source IP address.",
                        },
                        "dest_ip": {
                            "type": "STRING",
                            "description": "Filter by exact destination IP address.",
                        },
                        "dest_port": {
                            "type": "INTEGER",
                            "description": "Filter by destination port number.",
                        },
                        "threat_intel_status": {
                            "type": "STRING",
                            "description": "Filter by threat status: CLEAN, SUSPICIOUS, or MALICIOUS.",
                        },
                        "min_bytes": {
                            "type": "INTEGER",
                            "description": "Include only rows where bytes >= this value.",
                        },
                        "max_bytes": {
                            "type": "INTEGER",
                            "description": "Include only rows where bytes <= this value.",
                        },
                        "limit": {
                            "type": "INTEGER",
                            "description": "Maximum number of rows to return. Defaults to 10.",
                        },
                    },
                },
            },
            {
                "name": "block_device",
                "description": "Blocks a specific device ID or IP address from accessing the network by updating the firewall rules.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "device_id": {
                            "type": "STRING",
                            "description": "The device ID or IP address to block.",
                        }
                    },
                    "required": ["device_id"],
                },
            },
            {
                "name": "unblock_device",
                "description": "Unblocks a previously blocked device ID or IP address, restoring its network access by setting status back to ALLOWED.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "device_id": {
                            "type": "STRING",
                            "description": "The device ID or IP address to unblock.",
                        }
                    },
                    "required": ["device_id"],
                },
            },
            {
                "name": "get_active_connections",
                "description": (
                    "Fetch all active device connections from Firestore. "
                    "Returns device_id and connection fields for up to N devices."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "limit": {
                            "type": "INTEGER",
                            "description": "Maximum number of connection documents to return. Defaults to 20.",
                        }
                    },
                },
            },
            {
                "name": "get_connections_by_status",
                "description": (
                    "Fetch connections from Firestore filtered by status. "
                    "Valid status values: ACTIVE, BLOCKED, SUSPICIOUS. "
                    "Returns device_id and connection fields for matching devices."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "status": {
                            "type": "STRING",
                            "description": "The connection status to filter on: ACTIVE, BLOCKED, or SUSPICIOUS.",
                        },
                        "limit": {
                            "type": "INTEGER",
                            "description": "Maximum number of documents to return. Defaults to 20.",
                        },
                    },
                    "required": ["status"],
                },
            },
            {
                "name": "get_connection_details",
                "description": (
                    "Fetch connection details for a specific device ID or IP from Firestore. "
                    "Returns all stored fields for that device from the active_connections collection."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "device_id": {
                            "type": "STRING",
                            "description": "The device ID or IP address to look up.",
                        }
                    },
                    "required": ["device_id"],
                },
            },
            {
                "name": "get_network_summary",
                "description": (
                    "Return an at-a-glance summary of the entire network dataset. "
                    "Includes total event count, threat distribution (MALICIOUS / SUSPICIOUS / CLEAN counts), "
                    "top 5 destination ports by hit count, and top 5 source IPs by hit count with their "
                    "malicious hit count. Call this when the analyst asks for an overview, summary, "
                    "threat landscape, or at-a-glance view of network activity."
                ),
                "parameters": {"type": "OBJECT", "properties": {}},
            },
            {
                "name": "get_traffic_by_port",
                "description": (
                    "Query network_logs for traffic targeting a specific destination port. "
                    "Returns log_id, src_ip, threat_intel_status, timestamp, and bytes "
                    "for the top N rows ordered by most recent first."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "port": {
                            "type": "INTEGER",
                            "description": "The destination port number to filter on.",
                        },
                        "limit": {
                            "type": "INTEGER",
                            "description": "Maximum number of rows to return. Defaults to 5.",
                        },
                    },
                    "required": ["port"],
                },
            },
        ]
    }
]

_LIVE_CONFIG = types.LiveConnectConfig(
    system_instruction=_SYSTEM_INSTRUCTION,
    tools=_TOOL_DECLARATIONS,
    response_modalities=["AUDIO"],
    output_audio_transcription=types.AudioTranscriptionConfig(),
    input_audio_transcription=types.AudioTranscriptionConfig(),
    speech_config=types.SpeechConfig(
        language_code="en-US",
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
        ),
    ),
)


_TOOL_MAP = {
    "get_high_severity_threats": get_high_severity_threats,
    "get_traffic_by_port":       get_traffic_by_port,
    "filter_network_logs":       filter_network_logs,
    "get_network_summary":       get_network_summary,
    "block_device":              block_device,
    "unblock_device":            unblock_device,
    "get_active_connections":    get_active_connections,
    "get_connections_by_status": get_connections_by_status,
    "get_connection_details":    get_connection_details,
}

_TOOL_ACTION_MAP = {
    "get_high_severity_threats":  "RENDER_THREATS",
    "get_traffic_by_port":        "RENDER_TRAFFIC",
    "filter_network_logs":        "RENDER_FILTERED_LOGS",
    "get_network_summary":        "RENDER_SUMMARY",
    "block_device":               "DEVICE_BLOCKED",
    "unblock_device":             "DEVICE_UNBLOCKED",
    "get_active_connections":     "RENDER_CONNECTIONS",
    "get_connections_by_status":  "RENDER_CONNECTIONS",
    "get_connection_details":     "RENDER_CONNECTIONS",
}

_ACTION_FINDING_TYPE = {
    "RENDER_THREATS":       "threats",
    "RENDER_TRAFFIC":       "traffic",
    "RENDER_FILTERED_LOGS": "filteredLogs",
    "RENDER_SUMMARY":       "summary",
    "DEVICE_BLOCKED":       "deviceBlocked",
    "DEVICE_UNBLOCKED":     "deviceUnblocked",
    "RENDER_CONNECTIONS":   "connections",
}


class GeminiSession:
    def __init__(self, incident_id: str | None = None):
        self._cm = None
        self._session = None
        self.incident_id = incident_id
        self._transcript_buffers: dict[str, str] = {}
        self._reconnecting: bool = False
        self._client_gone: bool = False
        self._max_retries = 5
        self._base_delay = 1.0
        self._max_delay = 16.0

    async def _safe_send(self, websocket, data: str) -> bool:
        """Send text to client websocket. Returns False if client disconnected."""
        if self._client_gone:
            return False
        try:
            await websocket.send_text(data)
            return True
        except Exception:
            self._client_gone = True
            logger.info("Client websocket gone, stopping sends")
            return False

    async def __aenter__(self) -> "GeminiSession":
        self._cm = _client.aio.live.connect(model=GEMINI_MODEL, config=_LIVE_CONFIG)
        self._session = await self._cm.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.incident_id:
            await self._flush_transcripts()
        if self._cm is not None:
            await self._cm.__aexit__(exc_type, exc_val, exc_tb)

    def _buffer_transcript(self, role: str, text: str) -> None:
        self._transcript_buffers[role] = self._transcript_buffers.get(role, "") + text

    async def _flush_transcripts(self) -> None:
        if not self.incident_id:
            return
        buffers = self._transcript_buffers
        self._transcript_buffers = {}
        col = db.collection("incidents").document(self.incident_id).collection("transcripts")
        for role, text in buffers.items():
            if not text:
                continue
            try:
                await col.add({
                    "role": role,
                    "text": text,
                    "timestamp": firestore.SERVER_TIMESTAMP,
                })
            except Exception as e:
                logger.error("Failed to persist transcript: %s", e)

    async def _reconnect(self, websocket) -> bool:
        if self._client_gone:
            return False
        self._reconnecting = True
        await self._safe_send(websocket, json.dumps({"type": "agent_state", "state": "reconnecting"}))
        delay = self._base_delay

        for attempt in range(1, self._max_retries + 1):
            logger.warning("Reconnect attempt %d/%d (delay %.1fs)", attempt, self._max_retries, delay)
            await asyncio.sleep(delay)

            try:
                if self._cm is not None:
                    try:
                        await self._cm.__aexit__(None, None, None)
                    except Exception:
                        pass

                self._cm = _client.aio.live.connect(model=GEMINI_MODEL, config=_LIVE_CONFIG)
                self._session = await self._cm.__aenter__()
                self._reconnecting = False
                await self._safe_send(websocket, json.dumps({"type": "agent_state", "state": "listening"}))
                logger.info("Reconnected successfully on attempt %d", attempt)
                return True
            except Exception as e:
                logger.error("Reconnect attempt %d failed: %s", attempt, e)
                delay = min(delay * 2, self._max_delay)

        self._reconnecting = False
        await self._safe_send(websocket, json.dumps({"type": "agent_state", "state": "offline"}))
        logger.error("All %d reconnect attempts exhausted", self._max_retries)
        return False

    async def send_audio(self, pcm16_base64: str) -> None:
        if self._reconnecting or self._session is None:
            return
        raw = base64.b64decode(pcm16_base64)
        await self._session.send_realtime_input(
            audio=types.Blob(data=raw, mime_type="audio/pcm;rate=16000")
        )

    MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB
    MAX_IMAGE_DIMENSION = 1024

    @staticmethod
    def _normalize_image(raw: bytes, mime_type: str) -> tuple[bytes, str]:
        """Resize image so the longest side is at most MAX_IMAGE_DIMENSION and re-encode as JPEG."""
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > GeminiSession.MAX_IMAGE_DIMENSION:
            scale = GeminiSession.MAX_IMAGE_DIMENSION / max(w, h)
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue(), "image/jpeg"

    async def send_image(self, image_base64: str, mime_type: str = "image/jpeg") -> str | None:
        """Inject image directly into the Live session via realtime input.

        Returns an error message string if rejected, None on success.
        """
        if self._reconnecting or self._session is None:
            return "Session not available"
        raw = base64.b64decode(image_base64)
        if len(raw) > self.MAX_IMAGE_BYTES:
            size_mb = len(raw) / 1024 / 1024
            logger.warning("Image rejected: %.1f MB exceeds %.0f MB limit", size_mb, self.MAX_IMAGE_BYTES / 1024 / 1024)
            return f"Image too large ({size_mb:.1f} MB). Maximum size is 5 MB."

        raw, mime_type = self._normalize_image(raw, mime_type)

        await self._session.send_realtime_input(
            media=types.Blob(data=raw, mime_type=mime_type),
        )

        if self.incident_id:
            col = db.collection("incidents").document(self.incident_id).collection("transcripts")
            try:
                await col.add({
                    "role": "user",
                    "text": "[Image uploaded]",
                    "has_image": True,
                    "mime_type": mime_type,
                    "timestamp": firestore.SERVER_TIMESTAMP,
                })
            except Exception as e:
                logger.error("Failed to persist image transcript: %s", e)

        return None

    async def send_text(self, text: str) -> None:
        if self._reconnecting or self._session is None:
            return
        await self._session.send_client_content(
            turns=types.Content(
                role="user",
                parts=[types.Part(text=text)],
            ),
            turn_complete=True,
        )

    async def receive_audio_loop(self, websocket) -> None:
        consecutive_errors = 0
        while True:
            if self._client_gone:
                logger.info("Client gone, exiting receive loop")
                return
            try:
                async for msg in self._session.receive():
                    consecutive_errors = 0
                    logger.info(
                        "MSG: tool_call=%s data=%s server_content=%s",
                        bool(msg.tool_call), bool(msg.data), bool(msg.server_content),
                    )
                    if msg.server_content:
                        sc = msg.server_content
                        logger.info(
                            "  SC: turn_complete=%s interrupted=%s output_tx=%s input_tx=%s",
                            sc.turn_complete, sc.interrupted,
                            sc.output_transcription, sc.input_transcription,
                        )
                    if msg.tool_call:
                        function_calls = msg.tool_call.function_calls

                        async def _exec_tool(fc):
                            fn = _TOOL_MAP.get(fc.name)
                            args = fc.args or {}
                            try:
                                if fn is None:
                                    return fc, [{"error": f"Unknown tool: {fc.name}"}], args
                                elif asyncio.iscoroutinefunction(fn):
                                    return fc, await fn(**args), args
                                else:
                                    loop = asyncio.get_event_loop()
                                    return fc, await loop.run_in_executor(
                                        None, lambda f=fn, a=args: f(**a)
                                    ), args
                            except Exception as e:
                                logger.error("Tool %s raised: %s", fc.name, e)
                                return fc, [{"error": str(e)}], args

                        results = await asyncio.gather(*[_exec_tool(fc) for fc in function_calls])

                        for fc, result, args in results:
                            await self._session.send_tool_response(
                                function_responses=types.FunctionResponse(
                                    name=fc.name,
                                    id=fc.id,
                                    response={"output": result},
                                )
                            )
                            _has_error = len(result) == 1 and "error" in result[0]
                            action = _TOOL_ACTION_MAP.get(fc.name)
                            if action and not _has_error:
                                await self._safe_send(websocket,
                                    json.dumps({"type": "ui_update", "action": action, "payload": result})
                                )
                                if self.incident_id:
                                    finding_type = _ACTION_FINDING_TYPE.get(action)
                                    if finding_type:
                                        task = asyncio.create_task(
                                            add_finding(
                                                incident_id=self.incident_id,
                                                finding_type=finding_type,
                                                action=action,
                                                payload=result,
                                                tool_name=fc.name,
                                                tool_args=dict(args),
                                            )
                                        )
                                        task.add_done_callback(
                                            lambda t: t.exception() and logger.error("Failed to persist finding: %s", t.exception())
                                        )
                        continue
                    if msg.data:
                        b64 = base64.b64encode(msg.data).decode()
                        await self._safe_send(websocket,
                            json.dumps({"type": "audio", "data": b64})
                        )
                    try:
                        if msg.server_content and msg.server_content.output_transcription:
                            text = msg.server_content.output_transcription.text
                            if text:
                                await self._safe_send(websocket,
                                    json.dumps({"type": "transcript", "role": "agent", "text": text})
                                )
                                self._buffer_transcript("agent", text)
                        if msg.server_content and msg.server_content.input_transcription:
                            text = msg.server_content.input_transcription.text
                            if text:
                                await self._safe_send(websocket,
                                    json.dumps({"type": "transcript", "role": "user", "text": text})
                                )
                                self._buffer_transcript("user", text)
                    except Exception as e:
                        logger.error("Transcription handling error: %s", e, exc_info=True)
                    if msg.server_content and msg.server_content.interrupted:
                        await self._safe_send(websocket, json.dumps({"type": "interrupted"}))
                        asyncio.create_task(self._flush_transcripts())
                        break
                    if msg.server_content and msg.server_content.turn_complete:
                        await self._safe_send(websocket, json.dumps({"type": "turn_complete"}))
                        asyncio.create_task(self._flush_transcripts())
                        break
            except Exception as e:
                consecutive_errors += 1
                logger.error("receive_audio_loop error (%d consecutive): %s", consecutive_errors, e)
                if self._client_gone:
                    return
                if consecutive_errors >= 3:
                    if not await self._reconnect(websocket):
                        return
                    consecutive_errors = 0
                continue
