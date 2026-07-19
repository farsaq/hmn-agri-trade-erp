#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
command -v docker >/dev/null 2>&1 || { echo 'Docker is not installed or not in PATH.' >&2; exit 1; }
docker compose --env-file .env.docker up --build
