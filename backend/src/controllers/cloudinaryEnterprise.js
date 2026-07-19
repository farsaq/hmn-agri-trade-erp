import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { CloudAsset, CloudFolder, CloudSavedSearch, CloudShareLink, CloudSyncJob } from '../models/integrations.js';
import { AuditLog } from '../models/index.js';
import * as svc from '../services/integrations.js';
import { sendMail } from '../services/mail.js';

const isAdmin = (u) => ['admin', 'super-admin'].includes(u?.role);
const audit = (req, action, entity, description, metadata = {}) =>
  AuditLog.create({
    user: req.user?._id,
    action,
    entity,
    description,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    metadata,
  });
async function asset(id) {
  const x = await CloudAsset.findById(id);
  if (!x) {
    const e = new Error('Asset not found');
    e.status = 404;
    throw e;
  }
  return x;
}
function cleanPath(v) {
  return String(v || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
}

export async function bulkRename(req, res) {
  try {
    const ids = req.body.ids || [],
      pattern = String(req.body.pattern || '{name}-{n}'),
      start = Math.max(1, Number(req.body.start || 1));
    if (!ids.length) return res.status(400).json({ message: 'Select files' });
    const rows = await CloudAsset.find({ _id: { $in: ids }, status: { $ne: 'deleted' } });
    const results = [];
    for (let i = 0; i < rows.length; i++) {
      const x = rows[i],
        ext = x.format ? '.' + x.format : '',
        base = String(x.originalFilename || 'file').replace(/\.[^.]+$/, '');
      const newBase = pattern
        .replaceAll('{name}', base)
        .replaceAll('{n}', String(start + i))
        .replaceAll('{date}', new Date().toISOString().slice(0, 10));
      const newPublicId = `${x.folder}/${newBase}`;
      const r = await svc.renameCloudResource(x.publicId, newPublicId, x.resourceType);
      x.versions.push({
        publicId: x.publicId,
        secureUrl: x.secureUrl,
        version: x.version,
        folder: x.folder,
        originalFilename: x.originalFilename,
        bytes: x.bytes,
        width: x.width,
        height: x.height,
        format: x.format,
        comment: 'Snapshot before bulk rename',
        createdBy: req.user._id,
      });
      x.publicId = r.public_id;
      x.secureUrl = r.secure_url;
      x.originalFilename = newBase + ext;
      x.version = r.version;
      x.lastModifiedBy = req.user._id;
      await x.save();
      results.push(x);
    }
    await audit(req, 'CLOUD_BULK_RENAME', 'CloudAsset', 'Bulk renamed assets', { count: results.length, pattern });
    res.json({ count: results.length, items: results });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
}

export async function folders(req, res) {
  const items = await CloudFolder.find().populate('createdBy updatedBy', 'name email').sort({ path: 1 });
  res.json(items);
}
export async function createFolder(req, res) {
  try {
    const path = cleanPath(req.body.path);
    if (!path) return res.status(400).json({ message: 'Folder path required' });
    const parentPath = path.split('/').slice(0, -1).join('/');
    const item = await CloudFolder.create({
      name: path.split('/').pop(),
      path,
      parentPath,
      color: req.body.color,
      label: req.body.label,
      description: req.body.description,
      permissions: req.body.permissions,
      createdBy: req.user._id,
      updatedBy: req.user._id,
      activity: [{ action: 'created', user: req.user._id }],
    });
    await audit(req, 'CLOUD_FOLDER_CREATE', 'CloudFolder', `Created folder ${path}`, { path });
    res.status(201).json(item);
  } catch (e) {
    res.status(400).json({ message: e.code === 11000 ? 'Folder already exists' : e.message });
  }
}
export async function updateFolder(req, res) {
  const x = await CloudFolder.findById(req.params.id);
  if (!x) return res.status(404).json({ message: 'Folder not found' });
  const before = x.toObject();
  for (const k of ['color', 'label', 'description', 'permissions']) if (req.body[k] !== undefined) x[k] = req.body[k];
  x.updatedBy = req.user._id;
  x.activity.push({ action: 'updated', user: req.user._id, details: req.body });
  await x.save();
  await audit(req, 'CLOUD_FOLDER_UPDATE', 'CloudFolder', `Updated folder ${x.path}`, { before, after: x.toObject() });
  res.json(x);
}
export async function folderActivity(req, res) {
  const x = await CloudFolder.findById(req.params.id).populate('activity.user', 'name email');
  if (!x) return res.status(404).json({ message: 'Folder not found' });
  res.json(x.activity.slice().reverse());
}

export async function savedSearches(req, res) {
  res.json(await CloudSavedSearch.find({ $or: [{ owner: req.user._id }, { shared: true }] }).sort({ createdAt: -1 }));
}
export async function saveSearch(req, res) {
  res.status(201).json(
    await CloudSavedSearch.create({
      name: req.body.name,
      query: req.body.query || {},
      owner: req.user._id,
      shared: Boolean(req.body.shared),
    }),
  );
}
export async function deleteSearch(req, res) {
  await CloudSavedSearch.deleteOne({
    _id: req.params.id,
    $or: [{ owner: req.user._id }, ...(isAdmin(req.user) ? [{}] : [])],
  });
  res.json({ success: true });
}

export async function addVersionComment(req, res) {
  const x = await asset(req.params.id),
    v = x.versions.id(req.params.versionId);
  if (!v) return res.status(404).json({ message: 'Version not found' });
  v.comment = String(req.body.comment || '').slice(0, 1000);
  await x.save();
  await audit(req, 'CLOUD_VERSION_COMMENT', 'CloudAsset', 'Added version comment', { asset: x._id, version: v._id });
  res.json(v);
}
export async function approveVersion(req, res) {
  const x = await asset(req.params.id),
    v = x.versions.id(req.params.versionId);
  if (!v) return res.status(404).json({ message: 'Version not found' });
  v.approvalStatus = req.body.status === 'rejected' ? 'rejected' : 'approved';
  v.approvedBy = req.user._id;
  v.approvedAt = new Date();
  await x.save();
  await audit(req, 'CLOUD_VERSION_APPROVAL', 'CloudAsset', `${v.approvalStatus} asset version`, {
    asset: x._id,
    version: v._id,
  });
  res.json(v);
}
export async function compareVersions(req, res) {
  const x = await asset(req.params.id),
    a = x.versions.id(req.query.a),
    b = x.versions.id(req.query.b);
  if (!a || !b) return res.status(404).json({ message: 'Both versions required' });
  const fields = ['publicId', 'folder', 'originalFilename', 'bytes', 'width', 'height', 'format', 'version'];
  res.json({
    a,
    b,
    differences: Object.fromEntries(
      fields.filter((k) => String(a[k] ?? '') !== String(b[k] ?? '')).map((k) => [k, { a: a[k], b: b[k] }]),
    ),
  });
}

export async function createShare(req, res) {
  const ids = req.body.ids || [];
  if (!ids.length) return res.status(400).json({ message: 'Select files' });
  const token = crypto.randomBytes(24).toString('hex'),
    passwordHash = req.body.password ? await bcrypt.hash(String(req.body.password), 10) : undefined;
  const item = await CloudShareLink.create({
    token,
    assets: ids,
    createdBy: req.user._id,
    passwordHash,
    expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
    maxDownloads: Math.max(0, Number(req.body.maxDownloads || 0)),
    internalUsers: req.body.internalUsers || [],
  });
  await audit(req, 'CLOUD_SHARE_CREATE', 'CloudShareLink', 'Created asset share link', {
    share: item._id,
    count: ids.length,
  });
  res
    .status(201)
    .json({ ...item.toObject(), url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/shared/${token}` });
}
export async function shares(req, res) {
  res.json(
    await CloudShareLink.find(isAdmin(req.user) ? {} : { createdBy: req.user._id })
      .populate('assets', 'originalFilename secureUrl bytes resourceType')
      .populate('createdBy internalUsers', 'name email')
      .sort({ createdAt: -1 }),
  );
}
export async function revokeShare(req, res) {
  const x = await CloudShareLink.findById(req.params.id);
  if (!x) return res.status(404).json({ message: 'Share not found' });
  if (!isAdmin(req.user) && String(x.createdBy) !== String(req.user._id))
    return res.status(403).json({ message: 'Not allowed' });
  x.active = false;
  await x.save();
  res.json({ success: true });
}
export async function publicShare(req, res) {
  const x = await CloudShareLink.findOne({ token: req.params.token, active: true }).populate('assets');
  if (!x || (x.expiresAt && x.expiresAt < new Date()) || (x.maxDownloads > 0 && x.downloadCount >= x.maxDownloads))
    return res.status(410).json({ message: 'Share link expired or unavailable' });
  if (x.passwordHash) {
    if (!req.body.password) return res.status(401).json({ passwordRequired: true });
    if (!(await bcrypt.compare(String(req.body.password), x.passwordHash)))
      return res.status(401).json({ message: 'Incorrect password' });
  }
  x.downloadCount += 1;
  x.lastAccessedAt = new Date();
  await x.save();
  res.json({
    assets: x.assets.map((a) => ({
      _id: a._id,
      name: a.originalFilename,
      url: a.secureUrl,
      type: a.resourceType,
      bytes: a.bytes,
    })),
    expiresAt: x.expiresAt,
    remaining: x.maxDownloads ? Math.max(0, x.maxDownloads - x.downloadCount) : null,
  });
}

async function performSync(job) {
  job.status = 'running';
  job.progress = 10;
  job.stage = 'Listing database assets';
  job.startedAt = new Date();
  job.attempts += 1;
  await job.save();
  try {
    const db = await CloudAsset.find({ status: { $ne: 'deleted' } }).lean();
    job.progress = 35;
    job.stage = 'Listing Cloudinary assets';
    await job.save();
    const cloud = await svc.listCloudResources('hmn'),
      dm = new Map(db.map((x) => [x.publicId, x])),
      cm = new Map(cloud.map((x) => [x.public_id, x]));
    const missingCloud = db.filter((x) => !cm.has(x.publicId)),
      orphans = cloud.filter((x) => !dm.has(x.public_id));
    job.progress = 75;
    job.stage = 'Comparing and reconciling';
    await job.save();
    if (job.type === 'reconcile') {
      await CloudAsset.updateMany(
        { _id: { $in: missingCloud.map((x) => x._id) } },
        { $set: { status: 'deleted', softDeletedAt: new Date() } },
      );
      for (const r of orphans)
        await CloudAsset.updateOne(
          { publicId: r.public_id },
          {
            $setOnInsert: {
              publicId: r.public_id,
              secureUrl: r.secure_url,
              resourceType: r.resource_type,
              format: r.format,
              bytes: r.bytes,
              width: r.width,
              height: r.height,
              folder: r.asset_folder || r.public_id.split('/').slice(0, -1).join('/'),
              originalFilename: r.display_name || r.public_id.split('/').pop(),
              status: 'active',
            },
          },
          { upsert: true },
        );
    }
    job.status = 'completed';
    job.progress = 100;
    job.stage = 'Completed';
    job.result = {
      databaseAssets: db.length,
      cloudAssets: cloud.length,
      missingCloud: missingCloud.length,
      orphans: orphans.length,
    };
    job.completedAt = new Date();
    await job.save();
  } catch (e) {
    job.status = 'failed';
    job.progress = 100;
    job.stage = 'Failed';
    job.errorDetails.push({ message: e.message, at: new Date() });
    job.nextRetryAt =
      job.attempts < job.maxAttempts ? new Date(Date.now() + Math.pow(2, job.attempts) * 60000) : undefined;
    await job.save();
    if (process.env.CLOUD_SYNC_ALERT_EMAIL)
      try {
        await sendMail({
          to: process.env.CLOUD_SYNC_ALERT_EMAIL,
          subject: 'HMN Cloudinary sync failed',
          html: `<p>${e.message}</p>`,
        });
      } catch {}
    throw e;
  }
}
export async function createSyncJob(req, res) {
  const job = await CloudSyncJob.create({
    type: req.body.type === 'reconcile' ? 'reconcile' : 'scan',
    createdBy: req.user._id,
  });
  performSync(job).catch(() => {});
  res.status(202).json(job);
}
export async function syncJobs(req, res) {
  res.json(await CloudSyncJob.find().populate('createdBy', 'name email').sort({ createdAt: -1 }).limit(100));
}
export async function retrySyncJob(req, res) {
  const old = await CloudSyncJob.findById(req.params.id);
  if (!old) return res.status(404).json({ message: 'Job not found' });
  const job = await CloudSyncJob.create({ type: old.type, createdBy: req.user._id, maxAttempts: old.maxAttempts });
  performSync(job).catch(() => {});
  res.status(202).json(job);
}
export async function cancelSyncJob(req, res) {
  const job = await CloudSyncJob.findByIdAndUpdate(
    req.params.id,
    { status: 'cancelled', stage: 'Cancelled' },
    { new: true },
  );
  res.json(job);
}

export async function advancedAnalytics(req, res) {
  const since = new Date(Date.now() - 90 * 86400000);
  const [viewed, downloaded, unused, storageTrend, folderGrowth] = await Promise.all([
    CloudAsset.find({ status: { $ne: 'deleted' } })
      .sort({ lastAccessedAt: -1 })
      .limit(20)
      .select('originalFilename folder lastAccessedAt downloadCount secureUrl')
      .lean(),
    CloudAsset.find({ status: { $ne: 'deleted' } })
      .sort({ downloadCount: -1 })
      .limit(20)
      .select('originalFilename folder downloadCount bytes secureUrl')
      .lean(),
    CloudAsset.find({
      status: { $ne: 'deleted' },
      downloadCount: 0,
      $or: [{ lastAccessedAt: null }, { lastAccessedAt: { $exists: false } }],
      createdAt: { $lt: new Date(Date.now() - 30 * 86400000) },
    })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean(),
    CloudAsset.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          bytes: { $sum: '$bytes' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    CloudAsset.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { folder: '$folder', date: { $dateToString: { format: '%Y-%m', date: '$createdAt' } } },
          bytes: { $sum: '$bytes' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]),
  ]);
  res.json({
    mostViewed: viewed,
    mostDownloaded: downloaded,
    unused,
    storageTrend,
    folderGrowth,
    generatedAt: new Date(),
  });
}

export function startCloudSyncScheduler() {
  const hours = Math.max(1, Number(process.env.CLOUD_SYNC_INTERVAL_HOURS || 24));
  if (String(process.env.CLOUD_SYNC_AUTO_ENABLED || 'false') !== 'true') return;
  setInterval(async () => {
    const active = await CloudSyncJob.exists({ status: { $in: ['queued', 'running'] } });
    if (!active) {
      const job = await CloudSyncJob.create({
        type: process.env.CLOUD_SYNC_AUTO_RECONCILE === 'true' ? 'reconcile' : 'scan',
      });
      performSync(job).catch(() => {});
    }
  }, hours * 3600000).unref();
  console.log(`Cloudinary automatic sync enabled: every ${hours} hour(s)`);
}
