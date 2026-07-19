# Phase 2 — Task 2: Security Hardening

## Audit result

### Already implemented

- JWT access tokens and opaque refresh-token sessions
- bcrypt password hashing
- RBAC, custom roles, granular permissions, warehouse scoping
- Helmet, strict CORS allowlist, global rate limiting
- Zod validation across enterprise modules
- 2FA, recovery codes, email verification, OTP and password reset
- Account lockout, session listing/revocation and audit logging
- Upload size/type controls
- CodeQL, dependency review, secret scanning and npm audit CI workflows

### Hardened in v5.4.0

- Added authentication-specific rate limits for login, OTP, password reset and refresh
- Added recursive NoSQL/operator and prototype-pollution input-key rejection
- Added CSRF protection for cookie-authenticated mutation routes using trusted Origin plus `X-HMN-CSRF`
- Added refresh-token rotation and revocation of the previous session token
- Added JWT issuer, audience, algorithm allowlist and unique JWT IDs
- Strengthened production JWT-secret validation against common placeholder/weak values
- Hardened auth cookies with `SameSite=Strict`, `HttpOnly`, `Secure` in production and high priority
- Added no-store security response headers for API responses
- Added automated security regression tests
- Updated frontend API client to send the CSRF header on normal and refresh requests

### Remaining tracked improvements

- Replace legacy `otplib` v12 packages with v13 after migration testing
- Resolve five moderate transitive dependency advisories without forced breaking downgrades
- Centralize all disk-upload MIME/extension validation and add content-signature inspection
- Add distributed rate-limit storage (Redis) for multi-instance production deployment
- Add key-management/secret-vault integration and formal JWT-key rotation process
- Add dedicated DAST and authenticated OWASP ZAP staging scans
- Clean existing 21 frontend lint warnings in a separate UI-quality task

## Verification

- Backend lint: pass
- Backend tests: 62/62 pass
- Frontend lint: 0 errors, 21 pre-existing warnings
- Frontend production build: pass
