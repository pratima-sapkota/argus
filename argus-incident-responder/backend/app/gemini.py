import asyncio
import base64
import json
import logging

from google import genai

logger = logging.getLogger(__name__)
from google.genai import types

from app.config import settings
from app.tools import (
    block_device,
    filter_network_logs,
    get_active_connections,
    get_connection_details,
    get_connections_by_status,
    get_high_severity_threats,
    get_traffic_by_port,
)

GEMINI_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"

_client = genai.Client(api_key=settings.GOOGLE_API_KEY)

_SYSTEM_INSTRUCTION = (
    "You are Argus, an elite, military-precise Security Operations Center (SOC) AI assistant. "
    "Always respond in English only, regardless of the language of the user's input. "
    "You have direct access to live network telemetry via BigQuery and active firewall control. "
    "When an analyst asks about threats or port traffic, call the appropriate tool and report "
    "findings concisely: lead with the most critical data, use clear tactical language, "
    "and keep responses under 60 seconds of speech. Never speculate beyond the data returned. "
    "You can block a device or IP address using the block_device tool, but ONLY when the analyst "
    "explicitly orders you to block it. Never call block_device autonomously or proactively."
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
    "get_traffic_by_port": get_traffic_by_port,
    "filter_network_logs": filter_network_logs,
    "block_device": block_device,
    "get_active_connections": get_active_connections,
    "get_connections_by_status": get_connections_by_status,
    "get_connection_details": get_connection_details,
}

_TOOL_ACTION_MAP = {
    "get_high_severity_threats":  "RENDER_THREATS",
    "get_traffic_by_port":        "RENDER_TRAFFIC",
    "filter_network_logs":        "RENDER_FILTERED_LOGS",
    "block_device":               "DEVICE_BLOCKED",
    "get_active_connections":     "RENDER_CONNECTIONS",
    "get_connections_by_status":  "RENDER_CONNECTIONS",
    "get_connection_details":     "RENDER_CONNECTIONS",
}


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
                        for fc in msg.tool_call.function_calls:
                            fn = _TOOL_MAP.get(fc.name)
                            args = fc.args or {}
                            try:
                                if fn is None:
                                    result = [{"error": f"Unknown tool: {fc.name}"}]
                                elif asyncio.iscoroutinefunction(fn):
                                    result = await fn(**args)
                                else:
                                    result = fn(**args)
                            except Exception as e:
                                logger.error("Tool %s raised: %s", fc.name, e)
                                result = [{"error": str(e)}]
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
                                await websocket.send_text(
                                    json.dumps({"type": "ui_update", "action": action, "payload": result})
                                )
                        continue
                    if msg.data:
                        b64 = base64.b64encode(msg.data).decode()
                        await websocket.send_text(
                            json.dumps({"type": "audio", "data": b64})
                        )
                    try:
                        if msg.server_content and msg.server_content.output_transcription:
                            text = msg.server_content.output_transcription.text
                            if text:
                                await websocket.send_text(
                                    json.dumps({"type": "transcript", "role": "agent", "text": text})
                                )
                        if msg.server_content and msg.server_content.input_transcription:
                            text = msg.server_content.input_transcription.text
                            if text:
                                await websocket.send_text(
                                    json.dumps({"type": "transcript", "role": "user", "text": text})
                                )
                    except Exception as e:
                        logger.error("Transcription handling error: %s", e, exc_info=True)
                    if msg.server_content and msg.server_content.interrupted:
                        await websocket.send_text(json.dumps({"type": "interrupted"}))
                        break
                    if msg.server_content and msg.server_content.turn_complete:
                        await websocket.send_text(json.dumps({"type": "turn_complete"}))
                        break
            except Exception as e:
                logger.error("receive_audio_loop error: %s", e)
                # Don't break — a transient error should not kill the session.
                # The outer while loop will restart the receive iterator.
                continue
