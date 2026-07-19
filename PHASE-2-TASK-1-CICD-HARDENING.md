# Phase 2 — Task 1: CI/CD Hardening

## Implemented

- Canonical backend and frontend quality gates
- Strict zero-warning lint gates
- Prettier format verification
- Backend test report artifacts
- Frontend production build artifacts
- High/critical dependency audit gates
- Windows compatibility validation
- Docker Compose validation
- Backend and frontend Docker image builds with GitHub cache
- Full Docker runtime health verification
- Docker log artifact collection
- CodeQL JavaScript/TypeScript analysis
- Gitleaks secret scanning
- Pull-request dependency review
- Tag-based clean ZIP release generation
- SHA-256 release checksums
- Automatic GitHub Release creation
- Workflow concurrency cancellation and timeouts
- Grouped Dependabot updates

## Security packaging correction

The local `backend/.env` file and generated npm audit JSON were removed from the distributable source. Runtime secrets must be created from the provided example files and must never be committed.

## Required repository settings

1. Enable GitHub Actions.
2. Enable code scanning/Security tab where supported.
3. Protect `main` and require these checks before merge:
   - Backend quality gate
   - Frontend quality gate
   - Dependency security gate
   - Docker Compose, build and health checks
   - CodeQL analysis
   - Secret scanning
   - Dependency review
4. Create version tags such as `v5.3.0` to trigger release automation.

## Notes

- High and critical npm advisories fail CI. Existing moderate transitive advisories are reported but do not block releases.
- Release archives exclude `.env`, local logs, dependency folders, coverage, and generated audit files.

## Staged formatting enforcement

Formatting checks are present and reported, but temporarily non-blocking because the inherited source contains legacy formatting debt. Security, tests, builds, Docker health, and high/critical dependency checks are blocking. Formatting can become blocking after the dedicated code-format migration produces a reviewed, behavior-neutral change set.
