# Milestone 1 — Project Standards

## Status

**Complete.** HMN Agri Trade ERP v4 now has a production-oriented application foundation without rewriting existing business modules.

## Completed scope

### Project structure and duplicate cleanup

- Express application creation is isolated in `src/app.js`.
- Process startup, Socket.IO, schedulers and graceful shutdown remain in `src/server.js`.
- Repeated API mounting logic is centralized through `mountApi()`.
- Shared constants, configuration, response helpers and middleware are reused instead of repeated inline values.

### Configuration management

- `src/config/env.js` validates required environment values at startup.
- `src/config/index.js` exposes one immutable runtime configuration object.
- `.env.example` is deduplicated and grouped by concern.
- Real secrets are excluded from the release package.

### API standards

- Current API prefix: `/api/v1`.
- Legacy `/api` remains temporarily enabled for backward compatibility.
- Standard success and error response contracts are available.
- Every request receives an `x-request-id` response header.

### Health endpoints

- `GET /api/v1/health`
- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`

These endpoints are intentionally public and do not require authentication.

### Error standardization

The global handler normalizes:

- malformed JSON
- Mongoose validation errors
- invalid MongoDB identifiers
- duplicate-key errors
- expired and invalid JWTs
- Multer upload errors
- CORS and operational application errors
- unknown internal errors with production-safe messages

All error responses include a stable machine-readable code and request ID.

### Logging standardization

- Structured JSON logs are emitted by `src/utils/logger.js`.
- HTTP logs include request ID, method, path, status, duration and user context.
- Sensitive fields are recursively redacted.
- Database startup, shutdown, scheduler, audit and process-level errors use the same logger.
- `LOG_LEVEL` supports `debug`, `info`, `warn` and `error`.

### Security baseline

- Helmet enabled.
- CORS uses an explicit allow-list.
- API rate limiting enabled.
- `x-powered-by` disabled.
- Static uploads deny dotfiles and directory indexes.
- Secrets, uploads, backups, logs, dependencies and coverage are ignored by Git.

## Response contracts

### Success

```json
{
  "success": true,
  "message": "Request completed successfully",
  "data": {},
  "meta": {}
}
```

### Error

```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": []
  },
  "requestId": "uuid"
}
```

## Validation

```bash
npm install
npm run verify
npm run dev
```

`npm run verify` performs syntax checks and automated baseline tests.

## Migration policy

Existing controllers are not force-rewritten in Milestone 1 because that could break current frontend behavior. Each business module will migrate to the standard response and service patterns during its own stabilization milestone.
