import dotenv from 'dotenv';
dotenv.config();
import bcrypt from 'bcryptjs';
import { connectDB } from './config/db.js';
import { User, Product, Setting } from './models/index.js';
import { Warehouse, Role } from './models/enterprise.js';
import { ROLE_PERMISSIONS } from './middleware/auth.js';
import { WarehouseStock, Category, Brand } from './models/operations.js';
await connectDB();
const email = process.env.ADMIN_EMAIL || 'admin@hmn.com';
if (!(await User.findOne({ email })))
  await User.create({
    name: 'HMN Administrator',
    email,
    password: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin12345', 12),
    role: 'admin',
    permissions: ['*'],
    emailVerified: true,
  });

for (const [name, permissions] of Object.entries(ROLE_PERMISSIONS))
  await Role.findOneAndUpdate(
    { name },
    { name, description: `System ${name} role`, permissions, system: true },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
const mainWarehouse = await Warehouse.findOneAndUpdate(
  { code: 'MAIN' },
  { name: 'Main Warehouse', code: 'MAIN', address: 'Hala, Sindh, Pakistan', active: true },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);
for (const name of ['Cotton', 'Wheat', 'DAP', 'Urea', 'Bardana', 'Seeds', 'Pesticides', 'Other'])
  await Category.findOneAndUpdate(
    { name },
    { name, code: name.toUpperCase().replace(/\s+/g, '-') },
    { upsert: true, new: true },
  );
for (const name of ['HMN Select', 'Local Trade'])
  await Brand.findOneAndUpdate({ name }, { name }, { upsert: true, new: true });
if (!(await Product.countDocuments()))
  await Product.insertMany([
    {
      name: 'Cotton Premium',
      sku: 'COTTON-001',
      category: 'Cotton',
      grade: 'A',
      quality: 'Premium staple',
      unit: 'kg',
      purchasePrice: 180,
      salePrice: 195,
      wholesalePrice: 190,
      retailPrice: 200,
      availableStock: 42500,
      minimumStock: 10000,
      warehouse: mainWarehouse._id,
    },
    {
      name: 'Wheat Standard',
      sku: 'WHEAT-001',
      category: 'Wheat',
      quality: 'Food grade',
      unit: 'kg',
      purchasePrice: 95,
      salePrice: 105,
      availableStock: 28000,
      minimumStock: 8000,
      warehouse: mainWarehouse._id,
    },
    {
      name: 'DAP Fertilizer',
      sku: 'DAP-001',
      category: 'DAP',
      unit: 'bag',
      purchasePrice: 11200,
      salePrice: 11800,
      availableStock: 250,
      minimumStock: 60,
      warehouse: mainWarehouse._id,
    },
    {
      name: 'Urea Fertilizer',
      sku: 'UREA-001',
      category: 'Urea',
      unit: 'bag',
      purchasePrice: 4300,
      salePrice: 4600,
      availableStock: 420,
      minimumStock: 100,
      warehouse: mainWarehouse._id,
    },
  ]);
for (const p of await Product.find())
  await WarehouseStock.findOneAndUpdate(
    { product: p._id, warehouse: mainWarehouse._id, batch: null },
    {
      product: p._id,
      warehouse: mainWarehouse._id,
      batch: null,
      quantity: p.availableStock,
      averageCost: p.purchasePrice,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
await Setting.findOneAndUpdate(
  { key: 'company' },
  {
    key: 'company',
    value: {
      name: process.env.COMPANY_NAME || 'HMN Agri Trade',
      phone: process.env.COMPANY_PHONE || '',
      location: process.env.COMPANY_LOCATION || 'Hala, Sindh, Pakistan',
    },
  },
  { upsert: true },
);
console.log('Seed complete');
process.exit(0);
