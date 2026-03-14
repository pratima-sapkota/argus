#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [[ -z "${PROJECT_ID}" ]]; then
  echo "ERROR: No GCP project set. Run: gcloud config set project <PROJECT_ID>" >&2
  exit 1
fi

GITHUB_REPO="${1:?Usage: ./setup_wif.sh <owner/repo>}"

PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
POOL_NAME="github"
PROVIDER_NAME="github-actions"
SA_NAME="github-actions"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> Enabling required APIs..."
gcloud services enable iamcredentials.googleapis.com cloudbuild.googleapis.com run.googleapis.com --project="${PROJECT_ID}"

echo "==> Creating Workload Identity Pool..."
gcloud iam workload-identity-pools create "${POOL_NAME}" \
  --location="global" \
  --display-name="GitHub Actions" \
  --project="${PROJECT_ID}" 2>/dev/null || echo "Pool already exists."

echo "==> Creating Workload Identity Provider..."
gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_NAME}" \
  --location="global" \
  --workload-identity-pool="${POOL_NAME}" \
  --display-name="GitHub Actions OIDC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository==\"${GITHUB_REPO}\"" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --project="${PROJECT_ID}" 2>/dev/null || echo "Provider already exists."

echo "==> Creating service account ${SA_NAME}..."
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="GitHub Actions Deploy" \
  --project="${PROJECT_ID}" 2>/dev/null || echo "Service account already exists."

ROLES=(
  "roles/cloudbuild.builds.editor"
  "roles/run.admin"
  "roles/iam.serviceAccountUser"
  "roles/storage.admin"
  "roles/artifactregistry.writer"
)

for ROLE in "${ROLES[@]}"; do
  echo "Granting ${ROLE}..."
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}" \
    --quiet > /dev/null
done

echo "==> Allowing GitHub repo to impersonate the service account..."
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_REPO}" \
  --project="${PROJECT_ID}"

echo ""
echo "===== Setup complete ====="
echo ""
echo "Add these GitHub repository secrets:"
echo ""
echo "  GCP_PROJECT_ID = ${PROJECT_ID}"
echo "  WIF_PROVIDER   = projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}"
echo "  WIF_SERVICE_ACCOUNT = ${SA_EMAIL}"
