#!/usr/bin/env bash
set -euo pipefail

if [[ -f ".env" ]]; then
  echo "Loading .env..."
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required. Start local Postgres with: docker compose up -d postgres"
  exit 1
fi

pnpm dev
