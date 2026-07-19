import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const base = { timestamps: true };
export const IntegrationConfig =
  models.IntegrationConfig ||
  model(
    'IntegrationConfig',
    new Schema(
      {
        key: { type: String, unique: true, index: true },
        enabled: { type: Boolean, default: false },
        settings: Schema.Types.Mixed,
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      base,
    ),
  );
export const BackupRecord =
  models.BackupRecord ||
  model(
    'BackupRecord',
    new Schema(
      {
        name: { type: String, required: true, index: true },
        provider: { type: String, enum: ['local', 'google-drive'], default: 'local', index: true },
        fileId: String,
        path: String,
        size: Number,
        checksum: { type: String, required: true },
        status: { type: String, enum: ['created', 'verified', 'failed', 'restored'], default: 'created', index: true },
        version: { type: Number, default: 2 },
        collections: [String],
        manifest: Schema.Types.Mixed,
        automatic: { type: Boolean, default: false, index: true },
        reason: { type: String, default: 'manual' },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        verifiedAt: Date,
        restoredAt: Date,
        restoreCollections: [String],
        error: String,
      },
      base,
    ),
  );
export const PaymentTransaction =
  models.PaymentTransaction ||
  model(
    'PaymentTransaction',
    new Schema(
      {
        gateway: {
          type: String,
          enum: ['stripe', 'paypal', 'jazzcash', 'easypaisa', 'bank'],
          required: true,
          index: true,
        },
        reference: { type: String, unique: true, index: true },
        externalId: String,
        amount: { type: Number, required: true },
        currency: { type: String, default: 'PKR' },
        status: {
          type: String,
          enum: ['pending', 'requires_action', 'paid', 'failed', 'refunded', 'cancelled'],
          default: 'pending',
          index: true,
        },
        partyType: String,
        partyId: Schema.Types.ObjectId,
        invoiceId: Schema.Types.ObjectId,
        metadata: Schema.Types.Mixed,
        webhookPayload: Schema.Types.Mixed,
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        refundedAt: Date,
      },
      base,
    ),
  );
export const WebhookEndpoint =
  models.WebhookEndpoint ||
  model(
    'WebhookEndpoint',
    new Schema(
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        events: [String],
        secret: { type: String, required: true },
        active: { type: Boolean, default: true },
        headers: Schema.Types.Mixed,
        retryLimit: { type: Number, default: 5 },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      base,
    ),
  );
export const WebhookDelivery =
  models.WebhookDelivery ||
  model(
    'WebhookDelivery',
    new Schema(
      {
        endpoint: { type: Schema.Types.ObjectId, ref: 'WebhookEndpoint' },
        event: String,
        payload: Schema.Types.Mixed,
        status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
        attempts: { type: Number, default: 0 },
        responseStatus: Number,
        responseBody: String,
        nextRetryAt: Date,
        lastError: String,
      },
      base,
    ),
  );

export const CloudAsset =
  models.CloudAsset ||
  model(
    'CloudAsset',
    new Schema(
      {
        publicId: { type: String, required: true, unique: true, index: true },
        secureUrl: { type: String, required: true },
        resourceType: { type: String, default: 'image' },
        format: String,
        bytes: Number,
        width: Number,
        height: Number,
        originalFilename: String,
        mimeType: String,
        purpose: { type: String, index: true },
        folder: { type: String, index: true },
        relativePath: String,
        sha256: { type: String, index: true },
        processing: {
          quality: String,
          cropPreset: String,
          targetWidth: Number,
          targetHeight: Number,
          webp: Boolean,
          avif: Boolean,
          preserveExif: Boolean,
          thumbnailUrl: String,
          mediumUrl: String,
          optimizedUrl: String,
          avifUrl: String,
          lqipUrl: String,
          responsiveBreakpoints: [Schema.Types.Mixed],
        },
        virusScan: {
          status: {
            type: String,
            enum: ['not-configured', 'pending', 'clean', 'infected', 'failed'],
            default: 'not-configured',
          },
          provider: String,
          checkedAt: Date,
          message: String,
        },
        status: { type: String, enum: ['active', 'archived', 'deleted'], default: 'active', index: true },
        softDeletedAt: Date,
        restoredAt: Date,
        copiedFrom: { type: Schema.Types.ObjectId, ref: 'CloudAsset' },
        previousPublicIds: [String],
        favorite: { type: Boolean, default: false, index: true },
        tags: [String],
        notes: String,
        locked: { type: Boolean, default: false, index: true },
        lockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        lockedAt: Date,
        retentionUntil: Date,
        legalHold: { type: Boolean, default: false, index: true },
        versions: [
          {
            publicId: String,
            secureUrl: String,
            version: Number,
            folder: String,
            originalFilename: String,
            bytes: Number,
            width: Number,
            height: Number,
            format: String,
            comment: String,
            approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
            approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
            approvedAt: Date,
            createdAt: { type: Date, default: Date.now },
            createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
          },
        ],
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        ownerRole: String,
        department: String,
        branch: String,
        lastModifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        lastAccessedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        lastAccessedAt: Date,
        downloadCount: { type: Number, default: 0 },
        version: Number,
        deletedAt: Date,
        archivedAt: Date,
      },
      base,
    ),
  );

export const ProductTransferJob =
  models.ProductTransferJob ||
  model(
    'ProductTransferJob',
    new Schema(
      {
        entity: { type: String, enum: ['product', 'supplier'], default: 'product', index: true },
        type: { type: String, enum: ['import', 'export'], required: true, index: true },
        status: {
          type: String,
          enum: ['queued', 'processing', 'completed', 'partial', 'failed', 'cancelled'],
          default: 'queued',
          index: true,
        },
        format: String,
        fileName: String,
        originalFileName: String,
        filePath: String,
        originalFilePath: String,
        filters: Schema.Types.Mixed,
        duplicateStrategy: String,
        totalRows: { type: Number, default: 0 },
        processedRows: { type: Number, default: 0 },
        successRows: { type: Number, default: 0 },
        failedRows: { type: Number, default: 0 },
        duplicateRows: { type: Number, default: 0 },
        progress: { type: Number, default: 0 },
        stage: { type: String, default: 'Queued' },
        estimatedSeconds: Number,
        durationMs: Number,
        fileSize: Number,
        result: Schema.Types.Mixed,
        errorDetails: [Schema.Types.Mixed],
        warnings: [Schema.Types.Mixed],
        attempts: { type: Number, default: 0 },
        maxAttempts: { type: Number, default: 3 },
        cancelRequested: { type: Boolean, default: false },
        startedAt: Date,
        completedAt: Date,
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        ip: String,
        userAgent: String,
      },
      base,
    ),
  );

export const CloudUploadToken =
  models.CloudUploadToken ||
  model(
    'CloudUploadToken',
    new Schema(
      {
        tokenHash: { type: String, required: true, unique: true, index: true },
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        folder: String,
        purpose: String,
        expiresAt: { type: Date, required: true, index: { expires: 0 } },
        usedAt: Date,
        ip: String,
        userAgent: String,
      },
      base,
    ),
  );
export const CloudUploadAttempt =
  models.CloudUploadAttempt ||
  model(
    'CloudUploadAttempt',
    new Schema(
      {
        filename: String,
        mimeType: String,
        size: Number,
        folder: String,
        purpose: String,
        status: {
          type: String,
          enum: ['pending', 'success', 'failed', 'blocked', 'cancelled'],
          default: 'pending',
          index: true,
        },
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        asset: { type: Schema.Types.ObjectId, ref: 'CloudAsset' },
        durationMs: Number,
        errorCategory: String,
        errorMessage: String,
        stackRef: String,
        ip: String,
        userAgent: String,
        metadata: Schema.Types.Mixed,
      },
      base,
    ),
  );
export const CloudAccessLog =
  models.CloudAccessLog ||
  model(
    'CloudAccessLog',
    new Schema(
      {
        asset: { type: Schema.Types.ObjectId, ref: 'CloudAsset', index: true },
        publicId: String,
        user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        action: {
          type: String,
          enum: [
            'signature',
            'upload',
            'download',
            'delete',
            'archive',
            'restore',
            'failed-upload',
            'rename',
            'move',
            'copy',
            'soft-delete',
            'permanent-delete',
            'sync-scan',
            'sync-reconcile',
            'metadata-update',
            'lock',
            'unlock',
            'version-restore',
            'bulk-copy',
            'bulk-permanent-delete',
          ],
          required: true,
          index: true,
        },
        success: { type: Boolean, default: true, index: true },
        ip: String,
        userAgent: String,
        version: Number,
        error: String,
        metadata: Schema.Types.Mixed,
      },
      base,
    ),
  );

export const CloudFolder =
  models.CloudFolder ||
  model(
    'CloudFolder',
    new Schema(
      {
        name: { type: String, required: true, trim: true },
        path: { type: String, required: true, unique: true, index: true },
        parentPath: { type: String, default: '', index: true },
        color: { type: String, default: '#166534' },
        label: String,
        description: String,
        permissions: { viewRoles: [String], uploadRoles: [String], manageRoles: [String] },
        activity: [
          {
            action: String,
            user: { type: Schema.Types.ObjectId, ref: 'User' },
            details: Schema.Types.Mixed,
            createdAt: { type: Date, default: Date.now },
          },
        ],
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      base,
    ),
  );

export const CloudSavedSearch =
  models.CloudSavedSearch ||
  model(
    'CloudSavedSearch',
    new Schema(
      {
        name: { type: String, required: true },
        query: { type: Schema.Types.Mixed, required: true },
        owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        shared: Boolean,
      },
      base,
    ),
  );

export const CloudShareLink =
  models.CloudShareLink ||
  model(
    'CloudShareLink',
    new Schema(
      {
        token: { type: String, required: true, unique: true, index: true },
        assets: [{ type: Schema.Types.ObjectId, ref: 'CloudAsset' }],
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        passwordHash: String,
        expiresAt: { type: Date, index: true },
        maxDownloads: { type: Number, default: 0 },
        downloadCount: { type: Number, default: 0 },
        internalUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        active: { type: Boolean, default: true },
        lastAccessedAt: Date,
      },
      base,
    ),
  );

export const CloudSyncJob =
  models.CloudSyncJob ||
  model(
    'CloudSyncJob',
    new Schema(
      {
        type: { type: String, enum: ['scan', 'reconcile'], default: 'scan' },
        status: {
          type: String,
          enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
          default: 'queued',
          index: true,
        },
        progress: { type: Number, default: 0 },
        stage: String,
        attempts: { type: Number, default: 0 },
        maxAttempts: { type: Number, default: 3 },
        result: Schema.Types.Mixed,
        errorDetails: [Schema.Types.Mixed],
        startedAt: Date,
        completedAt: Date,
        nextRetryAt: Date,
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
      base,
    ),
  );
