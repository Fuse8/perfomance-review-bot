#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-performance-review-bot}"
REGION="${REGION:-europe-west1}"
PLACEHOLDER_URL="https://placeholder"

if [[ -f ".env" ]]; then
  echo "Loading .env..."
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

required() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: ${name}" >&2
    exit 1
  fi
}

required GOOGLE_CLOUD_PROJECT
required GOOGLE_CLIENT_ID
required GOOGLE_CLIENT_SECRET
required REVIEWS_ROOT_FOLDER_ID

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is not installed. Install Google Cloud SDK first." >&2
  exit 1
fi

gcloud config set project "${GOOGLE_CLOUD_PROJECT}" >/dev/null

echo "Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  chat.googleapis.com \
  drive.googleapis.com \
  firestore.googleapis.com

if ! gcloud firestore databases describe --database="(default)" >/dev/null 2>&1; then
  echo "Creating default Firestore database..."
  gcloud firestore databases create \
    --database="(default)" \
    --location="${FIRESTORE_LOCATION:-eur3}" \
    --type=firestore-native
fi

if [[ -z "${CLOUD_RUN_URL:-}" ]]; then
  APP_BASE_URL="${PLACEHOLDER_URL}"
  GOOGLE_REDIRECT_URI="${PLACEHOLDER_URL}/auth/google/callback"
  echo "CLOUD_RUN_URL is empty. Running first deploy with placeholder OAuth URLs..."
else
  APP_BASE_URL="${CLOUD_RUN_URL}"
  GOOGLE_REDIRECT_URI="${CLOUD_RUN_URL}/auth/google/callback"
  echo "Running final deploy for ${CLOUD_RUN_URL}..."
fi

gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --set-env-vars "APP_BASE_URL=${APP_BASE_URL}" \
  --set-env-vars "GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}" \
  --set-env-vars "GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}" \
  --set-env-vars "GOOGLE_REDIRECT_URI=${GOOGLE_REDIRECT_URI}" \
  --set-env-vars "REVIEWS_ROOT_FOLDER_ID=${REVIEWS_ROOT_FOLDER_ID}" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT}"

DEPLOYED_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --format='value(status.url)')"

echo
echo "Cloud Run URL: ${DEPLOYED_URL}"

if [[ -z "${CLOUD_RUN_URL:-}" ]]; then
  echo
  echo "Next:"
  echo "1. Add this OAuth redirect URI in Google Cloud Console:"
  echo "   ${DEPLOYED_URL}/auth/google/callback"
  echo "2. Re-run:"
  echo "   CLOUD_RUN_URL=${DEPLOYED_URL} bash scripts/deploy-cloud-run.sh"
else
  echo
  echo "Configure Google Chat app URL:"
  echo "${DEPLOYED_URL}/google-chat/events"
fi
