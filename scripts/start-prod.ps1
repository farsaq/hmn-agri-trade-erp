$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop is not installed or docker is not in PATH.' }
if (-not (Test-Path '.env.production')) { throw '.env.production is missing.' }
if (Select-String -Path '.env.production' -Pattern 'CHANGE_ME' -Quiet) { throw 'Replace every CHANGE_ME value in .env.production before starting production.' }
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production ps
