#!/usr/bin/env bash
set -euo pipefail

SA_NAME="argus-backend-sa"
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [[ -z "${PROJECT_ID}" ]]; then
  echo "ERROR: No GCP project set. Run: gcloud config set project <PROJECT_ID>" >&2
  exit 1
fi

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Creating service account ${SA_NAME}..."
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="Argus Backend Service Account" \
  --project="${PROJECT_ID}" 2>/dev/null || echo "Service account already exists."

ROLES=(
  "roles/aiplatform.user"
  "roles/datastore.user"
  "roles/bigquery.dataEditor"
)

for ROLE in "${ROLES[@]}"; do
  echo "Granting ${ROLE}..."
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}" \
    --quiet
done

echo ""
echo "Service account ${SA_EMAIL} is ready."
echo "It will be bound to the Cloud Run service during deployment via cloudbuild.yaml."
