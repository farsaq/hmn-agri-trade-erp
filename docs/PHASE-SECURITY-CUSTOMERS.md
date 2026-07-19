# Security + Customer Management Upgrade

Implemented in this build:

## Authentication

- Email verification token, verify endpoint, resend endpoint, and optional login enforcement.
- SMTP email delivery for verification, password reset, and login OTP.
- TOTP two-factor authentication compatible with Google Authenticator/Authy/Microsoft Authenticator.
- QR enrollment, one-use recovery codes, enable/disable workflow.
- Active session listing and revocation.
- Login audit entries and failed-login audit entries.

## Permissions

- Module/action permissions such as `customers.view`, `customers.create`, `customers.update`, `customers.delete`.
- Default role permission map for admin, manager, accountant, sales, warehouse, and viewer.
- Backend enforcement and frontend sidebar filtering.

## Customer management

- Full profile fields, image upload, CNIC validation, attachments.
- Customer profile page with transaction timeline and ledger.
- Credit-limit warning and available-credit calculation.
- Printable profile/statement endpoint and WhatsApp shortcut.

## Required SMTP environment values

Set these in `backend/.env` to send real email:

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user
SMTP_PASS=your-password
SMTP_FROM=HMN Agri Trade <no-reply@example.com>
REQUIRE_EMAIL_VERIFICATION=true
```

When SMTP is not configured and `NODE_ENV` is not `production`, verification/reset/OTP data is shown in development responses and server logs.
