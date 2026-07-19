# Cloudinary Enterprise Part 3 — File Manager & Synchronization

## File management

- Rename assets in Cloudinary and MongoDB.
- Move assets between Cloudinary folders.
- Copy assets to another folder.
- Soft delete to database trash without deleting the Cloudinary object.
- Restore soft-deleted assets after confirming the cloud object still exists.
- Admin-only permanent delete from Cloudinary and MongoDB.
- Bulk move-to-trash from the media library.

## Synchronization

- Compare MongoDB CloudAsset records with Cloudinary resources.
- Detect database records whose cloud objects are missing.
- Detect Cloudinary objects that do not have database records.
- Reconcile by trashing missing-cloud database records and optionally importing orphan cloud objects.
- All scans and reconciliation actions are access/audit logged.

## Security

- Existing one-time signed upload tokens and timestamp expiration retained.
- Existing file signature, MIME, dimension, hash and virus-hook validation retained.
- Existing per-role/per-folder Cloudinary policy retained.
- Permanent deletion is restricted to admin.
- Uploads, downloads, rename, move, copy, trash, restore, permanent deletion and synchronization are logged.

## UI

- Gallery and list views.
- Image and document preview.
- Search by file name, public ID and purpose.
- Filters by type, folder, uploader and status.
- Trash view with restore/permanent-delete actions.
- Sync health summary and admin reconciliation action.
