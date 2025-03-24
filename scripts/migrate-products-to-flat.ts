import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { connectToDatabase } from '../lib/mongodb.ts';
import { ObjectId } from 'mongodb';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Debug: Print current directory and env file path
const envPath = join(__dirname, '../.env.local');
console.log('Current directory:', __dirname);
console.log('Looking for .env.local at:', envPath);
console.log('File exists:', fs.existsSync(envPath));

// Debug: Print environment variables (without sensitive values)
console.log('Environment variables loaded:', {
  MONGODB_URI: process.env.MONGODB_URI ? 'exists' : 'missing',
  MONGODB_DB: process.env.MONGODB_DB ? 'exists' : 'missing'
});

interface OldProduct {
  _id: ObjectId;
  name: string;
  description: string;
  category: string;
  retailPrice: number;
  currentStock: number;
  minimumStock: number;
  lastPurchasePrice: number;
  averageCost: number;
  supplier: string;
  isProxied: boolean;
  proxyOf?: string;
  proxyRatio?: number;
  costHistory: any[];
  totalSpent: number;
  totalPurchased: number;
  lastRestockDate?: Date;
  active: boolean;
  variants: Array<{
    name: string;
    sku: string;
    barcode?: string;
    price: number;
    stock: number;
    platformMetadata: any[];
  }>;
  platformMetadata: any[];
  syncStatus: {
    lastSyncAttempt: Date;
    lastSuccessfulSync: Date;
    errors: any[];
  };
  createdAt: Date;
  updatedAt: Date;
}

interface NewProduct {
  _id?: ObjectId;
  parentId?: ObjectId;
  baseProductName: string;
  variantName: string;
  name: string;
  description: string;
  category: string;
  sku: string;
  barcode?: string;
  price: number;
  stock: number;
  minimumStock: number;
  lastPurchasePrice: number;
  averageCost: number;
  supplier: string;
  isProxied: boolean;
  proxyOf?: ObjectId;
  proxyRatio?: number;
  costHistory: any[];
  totalSpent: number;
  totalPurchased: number;
  lastRestockDate?: Date;
  active: boolean;
  platformMetadata: any[];
  syncStatus: {
    lastSyncAttempt: Date;
    lastSuccessfulSync: Date;
    errors: any[];
  };
  createdAt: Date;
  updatedAt: Date;
}

async function migrateProducts() {
  try {
    console.log('Connecting to database...');
    const { db } = await connectToDatabase();

    // Create a backup of the current products collection
    console.log('Creating backup of products collection...');
    const products = await db.collection('products').find({}).toArray();
    if (products.length > 0) {
      await db.collection('products_backup').insertMany(products);
      console.log(`Backup created in products_backup collection with ${products.length} documents`);
    } else {
      console.log('No products found to backup');
    }

    // Get all products from the old collection
    const oldProducts = products as OldProduct[];
    console.log(`Found ${oldProducts.length} products to migrate`);

    // Create a new collection for the migrated products
    const newProductsCollection = 'products_new';
    await db.createCollection(newProductsCollection);
    console.log('Created new collection for migrated products');

    const newProducts: NewProduct[] = [];
    let skippedProducts = 0;

    // Process each product
    for (const oldProduct of oldProducts) {
      try {
        // If the product has variants, create a document for each variant
        if (oldProduct.variants && oldProduct.variants.length > 0) {
          // Create a document for each variant
          for (const variant of oldProduct.variants) {
            const newProduct: NewProduct = {
              parentId: oldProduct.variants.length > 1 ? oldProduct._id : undefined,
              baseProductName: oldProduct.name,
              variantName: variant.name,
              name: `${oldProduct.name}${variant.name !== 'Default' ? ` - ${variant.name}` : ''}`,
              description: oldProduct.description,
              category: oldProduct.category,
              sku: variant.sku,
              barcode: variant.barcode,
              price: variant.price,
              stock: variant.stock,
              minimumStock: oldProduct.minimumStock,
              lastPurchasePrice: oldProduct.lastPurchasePrice,
              averageCost: oldProduct.averageCost,
              supplier: oldProduct.supplier,
              isProxied: oldProduct.isProxied,
              proxyOf: oldProduct.proxyOf ? new ObjectId(oldProduct.proxyOf) : undefined,
              proxyRatio: oldProduct.proxyRatio,
              costHistory: oldProduct.costHistory,
              totalSpent: oldProduct.totalSpent,
              totalPurchased: oldProduct.totalPurchased,
              lastRestockDate: oldProduct.lastRestockDate,
              active: oldProduct.active,
              platformMetadata: variant.platformMetadata,
              syncStatus: oldProduct.syncStatus,
              createdAt: oldProduct.createdAt,
              updatedAt: oldProduct.updatedAt
            };
            newProducts.push(newProduct);
          }
        } else {
          // Create a single document with a default variant
          const newProduct: NewProduct = {
            baseProductName: oldProduct.name,
            variantName: 'Default',
            name: oldProduct.name,
            description: oldProduct.description,
            category: oldProduct.category,
            sku: `${oldProduct.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-default`,
            price: oldProduct.retailPrice,
            stock: oldProduct.currentStock,
            minimumStock: oldProduct.minimumStock,
            lastPurchasePrice: oldProduct.lastPurchasePrice,
            averageCost: oldProduct.averageCost,
            supplier: oldProduct.supplier,
            isProxied: oldProduct.isProxied,
            proxyOf: oldProduct.proxyOf ? new ObjectId(oldProduct.proxyOf) : undefined,
            proxyRatio: oldProduct.proxyRatio,
            costHistory: oldProduct.costHistory,
            totalSpent: oldProduct.totalSpent,
            totalPurchased: oldProduct.totalPurchased,
            lastRestockDate: oldProduct.lastRestockDate,
            active: oldProduct.active,
            platformMetadata: oldProduct.platformMetadata,
            syncStatus: oldProduct.syncStatus,
            createdAt: oldProduct.createdAt,
            updatedAt: oldProduct.updatedAt
          };
          newProducts.push(newProduct);
        }
      } catch (error) {
        console.error(`Error processing product ${oldProduct._id}:`, error);
        skippedProducts++;
      }
    }

    // Insert all new products
    if (newProducts.length > 0) {
      console.log(`Inserting ${newProducts.length} new products...`);
      const result = await db.collection(newProductsCollection).insertMany(newProducts);
      console.log(`Inserted ${result.insertedCount} products`);
    }

    // Create indexes on the new collection
    console.log('Creating indexes...');
    await db.collection(newProductsCollection).createIndexes([
      { key: { baseProductName: 1 } },
      { key: { sku: 1 }, unique: true },
      { key: { parentId: 1 } },
      { key: { category: 1 } },
      { key: { stock: 1 } },
      { key: { active: 1 } },
      { key: { 'platformMetadata.productId': 1 } },
      { key: { 'platformMetadata.sku': 1 } }
    ]);

    console.log('\nMigration Summary:');
    console.log('------------------');
    console.log(`Total products processed: ${oldProducts.length}`);
    console.log(`New products created: ${newProducts.length}`);
    console.log(`Skipped products: ${skippedProducts}`);
    console.log('\nNext steps:');
    console.log('1. Verify the data in the products_new collection');
    console.log('2. If everything looks good, run these commands in MongoDB:');
    console.log('   db.products.renameCollection("products_old")');
    console.log('   db.products_new.renameCollection("products")');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateProducts(); 