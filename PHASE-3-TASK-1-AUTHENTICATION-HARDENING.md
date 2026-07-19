# Phase 3 — Task 1: Authentication & Authorization Hardening

Release: **v5.7.0**

## Completed

- Added strict RFC-style Bearer token extraction; malformed authorization headers are rejected.
- Added reusable authorization policy utilities for exact, global, and namespace-wildcard permissions.
- Added safe handling when role/permission middleware runs without an authenticated user.
- Standardized 401/403 authorization error envelopes with machine-readable error codes.
- Changed refresh-token rotation to an atomic `findOneAndUpdate` operation to prevent concurrent replay races.
- Logout now clears both refresh-session and trusted-device cookies.
- Added authentication policy unit tests and source-contract regression tests.
- Removed byte-identical `(2)` / `(3)` duplicate copies where a canonical file was present.

## Verification performed

- `node --check backend/src/middleware/auth.js` — passed.
- `node --check backend/src/controllers/auth.js` — passed.
- New authentication tests — **8 passed, 0 failed**.

## Local verification still required

Run after installing dependencies:

```powershell
cd backend
npm install
npm test
npm run lint
```

Then run the frontend verification:

```powershell
cd ..\frontend
npm install
npm test
npm run build
```

The production `.env` file is intentionally excluded from the release ZIP. Copy `backend/.env.example` to `backend/.env` and restore local credentials before starting the server.
