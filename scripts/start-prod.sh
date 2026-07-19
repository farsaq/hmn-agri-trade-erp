#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
command -v docker >/dev/null 2>&1 || { echo 'Docker is not installed or not in PATH.' >&2; exit 1; }
[ -f .env.production ] || { echo '.env.production is missing.' >&2; exit 1; }
if grep -q 'CHANGE_ME' .env.production; then echo 'Replace every CHANGE_ME value in .env.production before starting production.' >&2; exit 1; fi
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production ps
