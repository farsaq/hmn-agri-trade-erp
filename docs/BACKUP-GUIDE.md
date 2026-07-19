# HMN ERP Google Drive & Safe Backup Guide

## Features

- Manual local backup
- Manual Google Drive backup through a Google service account
- Automatic interval backups
- Backup history with size, provider, status, and creator
- SHA-256 integrity verification
- Authenticated download for local or Drive-only files
- Restore preview with current vs incoming collection counts
- Safe transactional restore
- Automatic pre-restore safety backup
- Retention cleanup for local and Google Drive files
- Admin-only API access

## Google Drive setup

1. Create a Google Cloud project.
2. Enable Google Drive API.
3. Create a service account and JSON key.
4. Create a Google Drive folder.
5. Share that folder with the service-account email as Editor.
6. Set the environment variables below.

```env
GOOGLE_DRIVE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
GOOGLE_DRIVE_FOLDER_ID=folder_id_from_drive_url
```

## Automatic backup configuration

```env
BACKUP_AUTO_ENABLED=true
BACKUP_AUTO_PROVIDER=drive
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_DAYS=30
BACKUP_KEEP_MINIMUM=5
```

Restart the backend after changing `.env`.

## Safety notes

- Restore endpoints are restricted to the built-in `admin` role.
- The typed confirmation must exactly match the backup file name.
- Integrity is checked before restore.
- A local pre-restore backup is automatically created.
- Test restore on a non-production database before first production use.
