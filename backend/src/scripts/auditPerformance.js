import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import '../models/index.js';

const RECOMMENDED_INDEXES = {
  users: [{ email: 1 }, { active: 1, role: 1 }],
  customers: [{ isDeleted: 1, active: 1, createdAt: -1 }, { village: 1, district: 1 }, { currentBalance: -1 }],
  suppliers: [{ isDeleted: 1, active: 1, createdAt: -1 }, { currentBalance: -1 }],
  products: [
    { isDeleted: 1, active: 1, createdAt: -1 },
    { category: 1, active: 1 },
    { availableStock: 1, reorderLevel: 1 },
  ],
  sales: [
    { customer: 1, status: 1, date: -1 },
    { status: 1, date: -1 },
    { warehouse: 1, date: -1 },
  ],
  purchases: [
    { supplier: 1, status: 1, date: -1 },
    { status: 1, date: -1 },
    { warehouse: 1, date: -1 },
  ],
  payments: [
    { partyModel: 1, party: 1, date: -1 },
    { status: 1, date: -1 },
  ],
  journalentries: [
    { status: 1, date: -1 },
    { fiscalYear: 1, accountingPeriod: 1, date: -1 },
  ],
  generalledgerentries: [{ account: 1, date: 1 }, { journal: 1 }, { date: -1 }],
  warehousestocks: [{ product: 1, warehouse: 1, batch: 1 }],
};

function signature(key) {
  return Object.entries(key)
    .map(([name, direction]) => `${name}:${direction}`)
    .join('|');
}

await connectDB();
const db = mongoose.connection.db;
const collections = await db.listCollections({}, { nameOnly: true }).toArray();
const report = [];
const warnings = [];
for (const { name } of collections) {
  const collection = db.collection(name);
  const indexes = await collection.indexes();
  let indexStats = null;
  try {
    indexStats = await collection.aggregate([{ $indexStats: {} }]).toArray();
  } catch (error) {
    warnings.push({ collection: name, check: 'indexStats', message: error.message });
  }
  const usage = new Map((indexStats || []).map((item) => [item.name, item.accesses?.ops || 0]));
  const existing = new Set(indexes.map((index) => signature(index.key)));
  const missing = (RECOMMENDED_INDEXES[name] || []).filter((key) => !existing.has(signature(key)));
  report.push({
    collection: name,
    documents: await collection.estimatedDocumentCount(),
    indexes: indexes.map((index) => ({
      name: index.name,
      key: index.key,
      unique: Boolean(index.unique),
      accesses: indexStats ? usage.get(index.name) || 0 : null,
    })),
    indexStatsAvailable: Boolean(indexStats),
    missingRecommended: missing,
  });
}
const missingRecommendedCount = report.reduce((total, item) => total + item.missingRecommended.length, 0);
console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      summary: { collections: report.length, missingRecommendedCount, indexStatsUnavailable: warnings.length },
      warnings,
      collections: report,
    },
    null,
    2,
  ),
);
if (process.env.PERFORMANCE_AUDIT_REQUIRE_INDEX_STATS === 'true' && warnings.length) process.exitCode = 2;
await disconnectDB();
