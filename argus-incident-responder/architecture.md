# Project Argus — Architecture Diagram

```mermaid
flowchart TB
    subgraph Browser["🖥️ Browser (Client)"]
        direction TB
        Mic["🎤 Microphone\n(Web Audio API)"]
        Speaker["🔊 Speaker\n(AudioContext)"]
        VAD["Voice Activity\nDetection (VAD)"]
        ReactApp["React 19 + Vite\nDashboard UI"]
        FirebaseSDK["Firebase JS SDK\n(Real-time Listener)"]

        Mic -->|"Raw Audio"| VAD
        VAD -->|"PCM16 base64\nChunks"| ReactApp
        ReactApp -->|"PCM16 base64\nAudio"| Speaker
    end

    subgraph GCP["Google Cloud Platform"]

        subgraph CloudRun["Cloud Run"]
            subgraph FrontendService["Frontend Service (Nginx)"]
                StaticFiles["Static React Build\n(HTML/JS/CSS)"]
            end

            subgraph BackendService["Backend Service (FastAPI + Uvicorn)"]
                direction TB
                WSEndpoint["/ws WebSocket\nEndpoint"]
                RESTAPI["REST API\n(/incidents CRUD)"]
                ToolExecutor["Tool Executor\n(7 Functions)"]
                FirewallMW["Firewall\nMiddleware"]
                TranscriptBuffer["Transcript\nBuffer"]

                WSEndpoint <-->|"Bidirectional\nAudio + JSON"| ToolExecutor
                RESTAPI --- FirewallMW
                WSEndpoint --- TranscriptBuffer
            end
        end

        subgraph GeminiAPI["Vertex AI"]
            Gemini["Gemini Live API\ngemini-live-2.5-flash\n-native-audio"]
            FunctionCalling["Function Calling\n(7 Tool Declarations)"]
            Gemini --- FunctionCalling
        end

        subgraph Firestore["Cloud Firestore"]
            Incidents["incidents\n(sessions, status)"]
            Transcripts["transcripts\n(subcollection)"]
            Findings["findings\n(subcollection)"]
            ActiveConn["active_connections\n(device status)"]
            Incidents --- Transcripts
            Incidents --- Findings
        end

        BigQuery["BigQuery\nargus_soc.network_logs\n(threat intel, traffic data)"]

        subgraph CICD["CI/CD Pipeline"]
            GHA["GitHub Actions"]
            CloudBuild["Cloud Build"]
            ArtifactReg["Artifact Registry\n(Docker Images)"]
            GHA -->|"Trigger"| CloudBuild
            CloudBuild -->|"Push Images"| ArtifactReg
            ArtifactReg -->|"Deploy"| CloudRun
        end
    end

    GitHub["GitHub\nRepository"]

    %% ── Browser ↔ Frontend Service ──
    Browser <-->|"HTTPS"| FrontendService

    %% ── Browser ↔ Backend (WebSocket) ──
    ReactApp <-->|"WebSocket (wss://)\nMultiplexed:\n• Audio (PCM16 base64)\n• Transcripts (JSON)\n• UI Updates (JSON)\n• Turn Control"| WSEndpoint

    %% ── Browser ↔ Backend (REST) ──
    ReactApp <-->|"HTTPS REST\nIncident CRUD"| RESTAPI

    %% ── Backend ↔ Gemini ──
    WSEndpoint <-->|"Streaming Audio\n(send_realtime_input)"| Gemini
    FunctionCalling -->|"Tool Call\nRequests"| ToolExecutor
    ToolExecutor -->|"Tool Call\nResponses"| Gemini

    %% ── Backend ↔ BigQuery ──
    ToolExecutor -->|"SQL Queries\n(parameterized)"| BigQuery
    BigQuery -->|"Threat Data\nTraffic Logs"| ToolExecutor

    %% ── Backend ↔ Firestore ──
    ToolExecutor <-->|"Read/Write\nDevice Status"| ActiveConn
    TranscriptBuffer -->|"Flush on turn_complete\nor interrupt"| Transcripts
    ToolExecutor -->|"Persist\nTool Results"| Findings
    RESTAPI <-->|"CRUD"| Incidents
    FirewallMW -->|"Check device\nblock status"| ActiveConn

    %% ── Browser ↔ Firestore (Direct) ──
    FirebaseSDK <-->|"onSnapshot\n(Real-time Listener)"| ActiveConn

    %% ── GitHub → CI/CD ──
    GitHub -->|"Push to main"| GHA

    %% Styling
    classDef browser fill:#1e293b,stroke:#60a5fa,stroke-width:2px,color:#e2e8f0
    classDef gcp fill:#0f172a,stroke:#a78bfa,stroke-width:2px,color:#e2e8f0
    classDef gemini fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#c7d2fe
    classDef firestore fill:#172554,stroke:#38bdf8,stroke-width:2px,color:#bae6fd
    classDef bigquery fill:#14532d,stroke:#4ade80,stroke-width:2px,color:#bbf7d0
    classDef cloudrun fill:#1c1917,stroke:#fb923c,stroke-width:2px,color:#fed7aa
    classDef cicd fill:#27272a,stroke:#a1a1aa,stroke-width:1px,color:#d4d4d8

    class Browser browser
    class GeminiAPI gemini
    class Firestore firestore
    class BigQuery bigquery
    class CloudRun cloudrun
    class CICD cicd
```

## Data Flow Summary

| Step | Flow | Protocol | Description |
|------|------|----------|-------------|
| 1 | Browser → Backend | WebSocket | User speaks; PCM16 audio captured via Web Audio API, VAD-gated, sent as base64 chunks |
| 2 | Backend → Gemini | Streaming gRPC | Audio relayed to Gemini Live API via `send_realtime_input()` |
| 3 | Gemini → Backend | Streaming gRPC | Gemini returns audio response + optional function calls |
| 4 | Backend → BigQuery | SQL | If Gemini calls a tool (e.g., `get_high_severity_threats`), parameterized query executes |
| 5 | Backend → Firestore | gRPC | Tool results persisted as findings; transcripts flushed on turn boundaries |
| 6 | Backend → Browser | WebSocket | Audio response + UI update JSON sent simultaneously for parallel rendering |
| 7 | Firestore → Browser | Firebase SDK | Real-time `onSnapshot` listener pushes device status changes directly to UI |

## Tool Function Mapping

| Gemini Tool Call | BigQuery / Firestore | UI Action |
|-----------------|---------------------|-----------|
| `get_high_severity_threats` | BigQuery → MALICIOUS rows | `RENDER_THREATS` |
| `filter_network_logs` | BigQuery → filtered logs | `RENDER_FILTERED_LOGS` |
| `get_traffic_by_port` | BigQuery → port traffic | `RENDER_TRAFFIC` |
| `get_active_connections` | Firestore → all devices | `RENDER_CONNECTIONS` |
| `get_connections_by_status` | Firestore → filtered devices | `RENDER_CONNECTIONS` |
| `get_connection_details` | Firestore → single device | `RENDER_CONNECTIONS` |
| `block_device` | Firestore → set BLOCKED | `DEVICE_BLOCKED` |
