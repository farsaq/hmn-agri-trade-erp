# Windows quick start

This archive must be extracted into a **new folder**. Do not paste it over the old v4.0 folder.

Expected files:

```text
PROJECT_FOLDER/
  backend/
  frontend/
  package.json
  INSTALL-WINDOWS.ps1
```

## Confirm correct version

```powershell
cd "PROJECT_FOLDER\frontend"
node -p "require('./package.json').version"
npm run
```

Expected version: `4.1.0`
Expected script: `lint`

## Setup

Copy the existing `backend/.env` into the new `backend` folder, then run from project root:

```powershell
PowerShell -ExecutionPolicy Bypass -File .\INSTALL-WINDOWS.ps1
```

## Start

Backend terminal:

```powershell
cd backend
npm run dev
```

Frontend terminal:

```powershell
cd frontend
npm run dev
```
