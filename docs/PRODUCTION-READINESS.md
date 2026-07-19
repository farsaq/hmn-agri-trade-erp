# Production readiness — owner actions

Automated code checks cannot rotate third-party credentials or prove a real restore/rollback. Complete these steps in the production environment before release:

1. Rotate the exposed MongoDB user password in Atlas, update the deployment secret store, revoke the old password, and verify login.
2. Copy `.env.production` to the secure deployment host and replace every `CHANGE_ME` and `example.com` value. Never commit that populated file.
3. Run `npm run production:validate`, then `npm run production:check`.
4. Create an encrypted backup, restore it into an isolated database, and reconcile record counts plus financial trial balance.
5. Apply migrations against a staging clone and record the migration version.
6. Verify health, authentication, authorization, rate limiting, security headers, audit logging, and monitoring alerts.
7. Deploy the release to staging, rehearse rollback to the prior image/database-compatible version, and record elapsed recovery time.

The repository ignores `.env` files and release packaging must exclude `.env`, logs, uploads, backups, and `node_modules`. The local `backend/.env` remains only for local execution; its currently exposed database password must still be rotated by the Atlas account owner.
