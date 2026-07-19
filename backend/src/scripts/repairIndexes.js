import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { normalizeProductIdentity } from '../validators/product.js';

if (!process.env.MONGO_URI) {
  throw new Error('MONGO_URI is missing from .env');
}

const client = new MongoClient(process.env.MONGO_URI);

async function dropIndexIfExists(collection, indexName) {
  try {
    await collection.dropIndex(indexName);
    console.log(`Dropped index: ${collection.collectionName}.${indexName}`);
  } catch (error) {
    if (error.codeName === 'IndexNotFound' || error.code === 27 || String(error.message).includes('index not found')) {
      console.log(`Index not present: ${collection.collectionName}.${indexName}`);
      return;
    }

    throw error;
  }
}

async function repairProductSkus(db) {
  const products = db.collection('products');

  const existingRows = await products
    .find({
      normalizedSku: {
        $type: 'string',
        $ne: '',
      },
    })
    .project({ normalizedSku: 1 })
    .toArray();

  const usedSkus = new Set(existingRows.map((row) => String(row.normalizedSku).trim()).filter(Boolean));

  const invalidProducts = await products
    .find({
      $or: [{ normalizedSku: null }, { normalizedSku: '' }, { normalizedSku: { $exists: false } }],
    })
    .project({
      sku: 1,
      productCode: 1,
      name: 1,
    })
    .toArray();

  let updated = 0;

  for (const product of invalidProducts) {
    const source = product.sku || product.productCode || product.name || `product-${product._id}`;

    let normalizedSku = normalizeProductIdentity({ sku: String(source) }).normalizedSku;

    if (!normalizedSku) {
      normalizedSku = `product-${String(product._id)}`;
    }

    const originalSku = normalizedSku;
    let counter = 1;

    while (usedSkus.has(normalizedSku)) {
      normalizedSku = `${originalSku}-${counter}`;
      counter += 1;
    }

    await products.updateOne(
      { _id: product._id },
      {
        $set: {
          normalizedSku,
        },
      },
    );

    usedSkus.add(normalizedSku);
    updated += 1;

    console.log(`Updated product ${String(product._id)} -> ${normalizedSku}`);
  }

  console.log(`Products repaired: ${updated}`);
}

async function main() {
  await client.connect();

  const db = client.db();
  console.log(`Connected to database: ${db.databaseName}`);

  await repairProductSkus(db);

  await dropIndexIfExists(db.collection('expenses'), 'expenseNo_1');
  await dropIndexIfExists(db.collection('purchases'), 'purchaseNo_1');
  await dropIndexIfExists(db.collection('sales'), 'invoiceNo_1');
  await dropIndexIfExists(db.collection('products'), 'normalizedSku_1');

  await dropIndexIfExists(db.collection('purchases'), 'supplier_1_supplierInvoiceNo_1');

  console.log('Database repair completed.');
}

main()
  .catch((error) => {
    console.error('Database repair failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
