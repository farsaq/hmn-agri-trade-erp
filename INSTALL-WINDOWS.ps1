$ErrorActionPreference = 'Stop'
Write-Host 'HMN Agri Trade ERP v4.1 setup' -ForegroundColor Cyan
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

if (-not (Test-Path (Join-Path $frontend 'package.json'))) { throw 'frontend/package.json not found.' }
if (-not (Test-Path (Join-Path $backend 'package.json'))) { throw 'backend/package.json not found.' }

Write-Host 'Installing root tooling...' -ForegroundColor Yellow
Set-Location $root
npm install

Write-Host 'Installing backend dependencies...' -ForegroundColor Yellow
Set-Location $backend
npm install

Write-Host 'Installing frontend dependencies...' -ForegroundColor Yellow
Set-Location $frontend
npm install

Write-Host 'Verifying backend...' -ForegroundColor Yellow
Set-Location $backend
npm run verify

Write-Host 'Linting frontend...' -ForegroundColor Yellow
Set-Location $frontend
npm run lint

Write-Host 'Building frontend...' -ForegroundColor Yellow
npm run build

Write-Host 'Setup and verification completed.' -ForegroundColor Green
Write-Host 'Backend: cd backend; npm run dev'
Write-Host 'Frontend: cd frontend; npm run dev'
