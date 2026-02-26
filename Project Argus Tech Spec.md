# **Project Argus: Technical Specification & Implementation Guide**

## **1\. Project Context**

**Target:** Gemini Live Agent Challenge (Category: Live Agents). **Goal:** Build a real-time, multimodal cybersecurity AI agent (SOC Copilot) that processes streaming voice audio, queries a Google BigQuery database via Gemini Function Calling, and actively manipulates a React frontend UI via WebSockets.

**Strict Requirements:** \* Must use gemini-2.0-flash (or Live API equivalent) via the google-genai SDK.

* Must support audio "barge-in" (user interruption).  
* Must run on Google Cloud (Cloud Run for compute, BigQuery for data).

## **2\. Master Directory Structure**

Initialize the repository with the following structure:

argus-incident-responder/  
├── backend/                  \# FastAPI Python backend  
│   ├── app/  
│   │   ├── main.py           \# FastAPI app & WebSocket endpoints  
│   │   ├── gemini.py         \# Google GenAI SDK Live API integration  
│   │   ├── tools.py          \# BigQuery SQL function definitions  
│   │   └── config.py         \# Environment variables & GCP setup  
│   ├── Dockerfile            \# Backend containerization  
│   └── requirements.txt      \# Python dependencies  
├── frontend/                 \# React frontend  
│   ├── src/  
│   │   ├── App.jsx           \# Main dashboard layout  
│   │   ├── components/       \# UI Cards (ThreatCard, MapWidget, AudioVisualizer)  
│   │   ├── hooks/  
│   │   │   ├── useWebSocket.js \# Manages WS connection to backend  
│   │   │   └── useAudio.js     \# Manages PCM16 mic recording & playback queue  
│   │   └── index.css         \# Tailwind or standard CSS  
│   ├── package.json            
│   └── Dockerfile            \# Frontend containerization (Nginx)  
├── data/                     \# Mock data resources  
│   └── mock\_network\_logs.csv \# Seed data for BigQuery  
├── scripts/  
│   ├── setup\_gcp.sh          \# Script to create BigQuery table & load data  
│   └── deploy.sh             \# CI/CD script for Cloud Run  
└── README.md                 \# Mandatory hackathon spin-up instructions

## **3\. Communication Contract (The WebSocket Multiplexer)**

The core innovation is the single WebSocket connection between the React Frontend and FastAPI Backend that handles *both* audio streaming and JSON UI commands.

### **A. Client-to-Server Messages**

The frontend sends JSON strings to the backend:

1. **Audio Chunk:** {"type": "realtime\_input", "media\_chunks": \[{"mime\_type": "audio/pcm;rate=16000", "data": "\<BASE64\_PCM16\_STRING\>"}\]}  
2. **Barge-In/Interrupt:** {"type": "client\_interrupt"} (Signals the backend to tell Gemini to stop generating the current response).

### **B. Server-to-Client Messages**

The backend sends JSON strings to the frontend:

1. **Audio Output:** {"type": "audio", "data": "\<BASE64\_PCM16\_STRING\>"} \-\> Frontend adds to audio playback queue.  
2. **UI Sync Command:** {"type": "ui\_update", "action": "RENDER\_THREAT", "payload": {"ips": \["192.168.1.50"\], "severity": "HIGH"}} \-\> Frontend updates React state to render UI components.

## **4\. Backend Implementation Specifications (FastAPI)**

### **4.1. Core Loop (main.py & gemini.py)**

* **Framework:** FastAPI using websockets for async communication.  
* **Gemini Connection:** Use the asynchronous google-genai SDK to connect to the Gemini Live API (model="gemini-2.0-flash").  
* **The Bridge:** The WebSocket endpoint must run two asynchronous tasks concurrently using asyncio.gather():  
  1. Task 1: Read from Client WS \-\> Forward to Gemini WS.  
  2. Task 2: Read from Gemini WS \-\> Forward to Client WS.

### **4.2. Tool Execution & BigQuery (tools.py)**

* Define Python functions with clear docstrings. Example: def get\_high\_severity\_ips(port: int) \-\> list\[str\]:  
* Use the google-cloud-bigquery library.  
* **The Parallel UI Sync (Crucial):** When Gemini invokes get\_high\_severity\_ips(), the backend must execute the SQL. Upon getting the results from BigQuery, the backend must do TWO things simultaneously:  
  1. Return the result back to Gemini as a ToolResponse.  
  2. Emit the {"type": "ui\_update", ...} payload to the Client WS so the screen updates *before* Gemini finishes speaking.

## **5\. Frontend Implementation Specifications (React)**

### **5.1. Audio Management (useAudio.js)**

* **Input:** Use navigator.mediaDevices.getUserMedia to capture mic audio. Convert to PCM16 at 16kHz. Base64 encode it and stream over WS.  
* **Output:** Maintain an audio playback buffer using the Web Audio API (AudioContext).  
* **Barge-In Logic:** If the user speaks (mic volume \> threshold), immediately call audioContext.close() or empty the playback buffer, and send the client\_interrupt signal to the backend.

### **5.2. UI State Management (App.jsx)**

* Maintain state for activeThreats.  
* Listen to the WS for ui\_update.  
* If action \== "RENDER\_THREAT", update activeThreats state, which maps to rendering \<ThreatCard /\> components dynamically.

## **6\. GCP Infrastructure Requirements**

* **BigQuery:** Create a dataset argus\_soc and a table network\_logs with schema: timestamp (TIMESTAMP), source\_ip (STRING), dest\_port (INTEGER), bytes (INTEGER), threat\_intel\_status (STRING).  
* **Cloud Run:** Both Frontend and Backend must be containerized and deployed to Google Cloud Run, with WebSockets enabled on the backend service.

## **7\. Mandatory Hackathon README.md Template**

*(Copy the text below into your root README.md file)*

# **Project Argus: Voice-Driven SOC Copilot**

**Category:** Live Agents (Gemini Live Agent Challenge)

Argus is a multimodal, real-time cybersecurity incident responder. It allows SOC analysts to verbally interrogate network logs using the Gemini Live API. By utilizing asynchronous WebSockets and Function Calling, Argus queries Google BigQuery in real-time and actively pushes visual threat intelligence to the React dashboard in perfect sync with its voice responses.

### **Architecture Highlights**

* **AI:** Gemini Live API (via GenAI SDK)  
* **Backend:** FastAPI, Python, WebSockets  
* **Frontend:** React, Web Audio API  
* **Data & Hosting:** Google BigQuery, Google Cloud Run

### **Spin-Up Instructions (Local Development)**

#### **1\. Prerequisites**

* Google Cloud Project with Billing Enabled.  
* Vertex AI API & BigQuery API enabled.  
* Node.js 18+ and Python 3.11+.

#### **2\. Google Cloud Setup**

1. Create a service account with BigQuery Data Viewer and Vertex AI User roles. Download the JSON key.  
2. Set the environment variable: export GOOGLE\_APPLICATION\_CREDENTIALS="/path/to/key.json"  
3. Run bash scripts/setup\_gcp.sh to initialize the mock BigQuery dataset.

#### **3\. Start Backend**

cd backend  
python \-m venv venv  
source venv/bin/activate  
pip install \-r requirements.txt  
uvicorn app.main:app \--host 0.0.0.0 \--port 8000

#### **4\. Start Frontend**

cd frontend  
npm install  
npm run dev

Navigate to localhost:5173. Ensure microphone permissions are granted.

### **Proof of Google Cloud Deployment**

* **Live Demo URL:** \[Link to Cloud Run URL\]  
* **Deployment Video/Proof:** \[Link to Video demonstrating Cloud Run / BigQuery usage\]

### **Third-Party Integrations**

* React (MIT License)  
* FastAPI (MIT License)  
* TailwindCSS (MIT License)