# Project Argus: Voice-Driven SOC Copilot

Argus is a real-time, voice-driven Security Operations Center (SOC) AI agent built for the **Gemini Live Agent Challenge**. It enables SOC analysts to interrogate network security logs through natural speech using the Gemini Live API. The agent queries Google BigQuery for threat intelligence, manages device states in Cloud Firestore, and pushes live visual updates to a React dashboard — all in sync with its spoken responses over a single multiplexed WebSocket connection.

## Features

- **Voice-First Interaction** — Speak naturally to query network logs, investigate threats, and issue commands. Supports barge-in (interrupt the agent mid-sentence).
- **Real-Time Threat Intelligence** — Query BigQuery for high-severity threats, filter logs by IP/port/status, and analyze traffic patterns — all via voice.
- **Device Management** — View active network connections in real time, block suspicious devices, and filter connections by status (ACTIVE / BLOCKED / SUSPICIOUS).
- **Incident Tracking** — Each session creates a persistent incident record with full transcripts and tool execution findings, enabling post-session review.
- **Parallel UI Sync** — When the agent executes a tool, results render on the dashboard *before* the agent finishes speaking, keeping the visual and audio experience in lockstep.
- **Live Audio Streaming** — Bidirectional PCM16 audio at 16kHz streamed between the browser and Gemini via WebSocket.

## Tech Stack

| Layer | Technology |
|---|---|
| **AI** | Gemini Live API (`gemini-live-2.5-flash-native-audio`) via `google-genai` SDK |
| **Backend** | FastAPI (Python 3.13), Uvicorn, WebSockets |
| **Frontend** | React 19, Vite, Tailwind CSS, Web Audio API |
| **Analytics DB** | Google BigQuery (`argus_soc.network_logs`) |
| **Operational DB** | Google Cloud Firestore (incidents, transcripts, findings, active connections) |
| **Frontend SDK** | Firebase JS SDK (Firestore real-time listeners) |
| **Hosting** | Google Cloud Run (containerized backend + frontend) |
| **CI/CD** | GitHub Actions + Google Cloud Build + Workload Identity Federation |

## Architecture

![Architecture Diagram](./docs/architecture/architecture.png)

## Local Development Setup

### Prerequisites

- **Google Cloud Project** with billing enabled
- **gcloud CLI** installed and authenticated (`gcloud auth login`)
- **Python 3.13+**
- **Node.js 22+** and **pnpm** (`corepack enable && corepack prepare pnpm@9 --activate`)
- **uv** package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Google Application Default Credentials configured (`gcloud auth application-default login`)

### 1. GCP Setup

```bash
# Set your project
gcloud config set project <YOUR_PROJECT_ID>

# Enable APIs and create BigQuery dataset
cd argus-incident-responder
chmod +x scripts/setup_gcp.sh
./scripts/setup_gcp.sh

# Create the service account for the backend
chmod +x scripts/setup_service_account.sh
./scripts/setup_service_account.sh

# Seed BigQuery with synthetic network log data
uv run scripts/generate_mock_data.py
```

### 2. Start the Backend

```bash
cd argus-incident-responder/backend

# Create a .env file from the example
cp .env.example .env
# Edit .env and set:
#   GOOGLE_CLOUD_PROJECT=<YOUR_PROJECT_ID>
#   GOOGLE_CLOUD_LOCATION=us-central1  (optional, defaults to us-central1)

# Install dependencies and run
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The backend will be available at `http://localhost:8000`.

### 3. Start the Frontend

```bash
cd argus-incident-responder/frontend

# Create a .env file from the example
cp .env.example .env
# Edit .env and set:
#   VITE_API_URL=http://localhost:8000
#   VITE_FIREBASE_API_KEY=<your Firebase API key>
#   VITE_FIREBASE_AUTH_DOMAIN=<your Firebase auth domain>
#   VITE_FIREBASE_PROJECT_ID=<your GCP project ID>
#   VITE_FIREBASE_APP_ID=<your Firebase app ID>

# Install dependencies and run
pnpm install
pnpm run dev
```

The frontend will be available at `http://localhost:5173`. Grant microphone permissions when prompted.

### Available Scripts

| Directory | Command | Description |
|---|---|---|
| `frontend/` | `pnpm run dev` | Start Vite dev server with hot reload |
| `frontend/` | `pnpm run build` | Production build to `dist/` |
| `frontend/` | `pnpm run preview` | Preview the production build locally |
| `frontend/` | `pnpm run lint` | Run ESLint |
| `backend/` | `uv run uvicorn app.main:app --reload` | Start FastAPI dev server with auto-reload |
| `scripts/` | `./setup_gcp.sh` | Enable GCP APIs and create BigQuery dataset |
| `scripts/` | `uv run generate_mock_data.py` | Seed BigQuery with 1,000 synthetic log rows |
| `scripts/` | `./setup_service_account.sh` | Create backend service account with required IAM roles |
| `scripts/` | `./setup_wif.sh <owner/repo>` | Configure Workload Identity Federation for GitHub Actions CI/CD |

## License

This project was built for the Gemini Live Agent Challenge hackathon.
