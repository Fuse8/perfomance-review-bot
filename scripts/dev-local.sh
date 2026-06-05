#!/usr/bin/env bash
set -euo pipefail

if [[ -f ".env" ]]; then
  echo "Loading .env..."
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
elif [[ -f ".env" ]]; then
  echo "Loading .env..."
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

export STORAGE_DRIVER="${STORAGE_DRIVER:-local}"
export LOCAL_STORAGE_PATH="${LOCAL_STORAGE_PATH:-.data/storage.json}"

pnpm dev
