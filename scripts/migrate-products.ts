import mongoose, { connect, disconnect } from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
config({ path: join(__dirname, '../.env.local') });

interface IPlatformMetadata {
  platform: 'shopify' | 'square';
  productId: string;
  variantId?: string;
  parentId?: string;
  sku?: string;
  barcode?: string;
  lastSyncedAt: Date;
  syncStatus: 'success' | 'failed' | 'pending';
  lastError?: string;
}

interface OldProduct {
  _id: any;
  name: string;
  description: string;
  sku: string;
  retailPrice: number;
  currentStock: number;
  minimumStock: number;
  lastPurchasePrice: number;
  averageCost: number;
  supplier: string;
  squareId?: string;
  squareParentId?: string;
  shopifyId?: string;
  shopifyVariantId?: string;
  isProxied: boolean;
  proxyOf?: string;
  proxyRatio?: number;
  costHistory: any[];
  totalSpent: number;
  totalPurchased: number;
  lastRestockDate?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

async function migrateProducts() {
  try {
    // Connect to the database
    await connect(process.env.MONGODB_URI as string);
    console.log('Connected to database');

    // Get the old products collection
    if (!mongoose.connection.db) {
      throw new Error('Database connection not established');
    }
    const oldProducts = await mongoose.connection.db.collection('products').find({}).toArray();
    const totalProducts = oldProducts.length;
    console.log(`Found ${totalProducts} products to migrate`);

    // Create a backup collection
    const backupCollection = mongoose.connection.db.collection('products_backup');
    await backupCollection.insertMany(oldProducts);
    console.log('Created backup of old products');

    // Process each product
    let processed = 0;
    let errors = 0;

    for (const oldProduct of oldProducts) {
      try {
        // Create platform metadata
        const platformMetadata: IPlatformMetadata[] = [];
        if (oldProduct.squareId) {
          platformMetadata.push({
            platform: 'square',
            productId: oldProduct.squareId,
            parentId: oldProduct.squareParentId,
            lastSyncedAt: new Date(),
            syncStatus: 'success'
          });
        }
        if (oldProduct.shopifyId) {
          platformMetadata.push({
            platform: 'shopify',
            productId: oldProduct.shopifyId,
            variantId: oldProduct.shopifyVariantId,
            sku: oldProduct.sku,
            lastSyncedAt: new Date(),
            syncStatus: 'success'
          });
        }

        // Create main variant from the product itself
        const mainVariant = {
          name: 'Default',
          sku: oldProduct.sku,
          price: oldProduct.retailPrice,
          stock: oldProduct.currentStock,
          platformMetadata: platformMetadata.map(meta => ({
            ...meta,
            variantId: meta.platform === 'shopify' ? oldProduct.shopifyVariantId : undefined
          }))
        };

        // Create the new product document
        const newProduct = {
          name: oldProduct.name,
          description: oldProduct.description || '',
          category: '', // We'll need to set this manually
          retailPrice: oldProduct.retailPrice,
          currentStock: oldProduct.currentStock,
          minimumStock: oldProduct.minimumStock,
          lastPurchasePrice: oldProduct.lastPurchasePrice,
          averageCost: oldProduct.averageCost,
          supplier: oldProduct.supplier || '',
          isProxied: oldProduct.isProxied || false,
          proxyOf: oldProduct.proxyOf,
          proxyRatio: oldProduct.proxyRatio,
          costHistory: oldProduct.costHistory.map(entry => ({
            ...entry,
            date: new Date(entry.date),
            source: entry.source || 'manual'
          })),
          totalSpent: oldProduct.totalSpent,
          totalPurchased: oldProduct.totalPurchased,
          lastRestockDate: oldProduct.lastRestockDate ? new Date(oldProduct.lastRestockDate) : undefined,
          active: oldProduct.active,
          variants: [mainVariant],
          platformMetadata,
          syncStatus: {
            lastSyncAttempt: new Date(),
            lastSuccessfulSync: new Date(),
            errors: []
          },
          createdAt: new Date(oldProduct.createdAt),
          updatedAt: new Date(oldProduct.updatedAt)
        };

        // Insert the new product
        await mongoose.connection.db.collection('products_new').insertOne(newProduct);
        processed++;

        // Log progress
        if (processed % 10 === 0) {
          console.log(`Processed ${processed}/${totalProducts} products`);
        }

      } catch (error) {
        console.error(`Error processing product ${oldProduct._id}:`, error);
        errors++;
      }
    }

    // Log final results
    console.log('\nMigration completed:');
    console.log(`- Total products processed: ${processed}`);
    console.log(`- Errors encountered: ${errors}`);
    console.log(`- Success rate: ${((processed / totalProducts) * 100).toFixed(2)}%`);

    // Disconnect from database
    await disconnect();
    console.log('\nDisconnected from database');
    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    await disconnect();
    process.exit(1);
  }
}

// Run the migration
migrateProducts(); 