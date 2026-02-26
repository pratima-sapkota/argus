#!/usr/bin/env bash
# =============================================================================
# Project Argus - GCP Environment Setup Script
# =============================================================================
# Prerequisites (run these manually before executing this script):
#   gcloud auth login
#   gcloud config set project <YOUR_PROJECT_ID>
#
# Usage:
#   chmod +x scripts/setup_gcp.sh
#   ./scripts/setup_gcp.sh
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BIGQUERY_DATASET="argus_soc"
BIGQUERY_LOCATION="US"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { echo "[INFO]  $*"; }
warn()  { echo "[WARN]  $*" >&2; }
error() { echo "[ERROR] $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Verify gcloud is authenticated and a project is set
# ---------------------------------------------------------------------------
info "Verifying gcloud configuration..."

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [[ -z "${PROJECT_ID}" ]]; then
  error "No GCP project is set. Run: gcloud config set project <YOUR_PROJECT_ID>"
fi

ACCOUNT=$(gcloud config get-value account 2>/dev/null)
if [[ -z "${ACCOUNT}" ]]; then
  error "Not authenticated. Run: gcloud auth login"
fi

info "Using project : ${PROJECT_ID}"
info "Authenticated as: ${ACCOUNT}"

# ---------------------------------------------------------------------------
# Enable required GCP APIs
# ---------------------------------------------------------------------------
APIS=(
  "aiplatform.googleapis.com"    # Vertex AI / Gemini
  "bigquery.googleapis.com"      # BigQuery
  "run.googleapis.com"           # Cloud Run (for backend deployment)
)

info "Enabling required GCP APIs..."
for API in "${APIS[@]}"; do
  info "  Enabling ${API}..."
  gcloud services enable "${API}" --project="${PROJECT_ID}"
done
info "All APIs enabled."

# ---------------------------------------------------------------------------
# Create BigQuery dataset
# ---------------------------------------------------------------------------
info "Checking for BigQuery dataset '${BIGQUERY_DATASET}'..."

if bq ls --project_id="${PROJECT_ID}" --datasets | grep -qw "${BIGQUERY_DATASET}"; then
  warn "Dataset '${BIGQUERY_DATASET}' already exists — skipping creation."
else
  info "Creating BigQuery dataset '${BIGQUERY_DATASET}' in location '${BIGQUERY_LOCATION}'..."
  bq mk \
    --project_id="${PROJECT_ID}" \
    --dataset \
    --location="${BIGQUERY_LOCATION}" \
    --description="Project Argus SOC network telemetry dataset" \
    "${PROJECT_ID}:${BIGQUERY_DATASET}"
  info "Dataset '${BIGQUERY_DATASET}' created successfully."
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
info "============================================================"
info " GCP setup complete for project: ${PROJECT_ID}"
info " Next step: run scripts/generate_mock_data.py to seed data."
info "============================================================"
