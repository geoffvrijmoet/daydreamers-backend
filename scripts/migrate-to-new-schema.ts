import { connectToDatabase } from './db-connect.js'
import { ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

// For debugging
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
console.log('Current directory:', __dirname)
console.log('Files in lib directory:', fs.readdirSync(path.resolve(__dirname, '../lib')))

// Construct absolute path
const mongodbPath = path.resolve(__dirname, '../lib/mongodb.js')
console.log('MongoDB path:', mongodbPath)
console.log('MongoDB file exists:', fs.existsSync(mongodbPath))

// Use dynamic import for MongoDB connection
async function getMongoConnection() {
  try {
    const mongodb = await import(mongodbPath)
    return mongodb.connectToDatabase
  } catch (error) {
    console.error('Error importing MongoDB module:', error)
    process.exit(1)
  }
}

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

interface OldProduct {
  _id: ObjectId;
  name: string;
  description?: string;
  category: string;
  retailPrice: number;
  currentStock: number;
  minimumStock: number;
  lastPurchasePrice: number;
  averageCost: number;
  supplier?: string;
  isProxied: boolean;
  proxyOf?: string;
  proxyRatio?: number;
  costHistory: Array<{
    date: Date;
    cost: number;
    quantity: number;
    source: 'wholesale' | 'manual' | 'square' | 'shopify';
    reference?: string;
  }>;
  totalSpent: number;
  totalPurchased: number;
  lastRestockDate?: Date;
  active: boolean;
  squareId?: string;
  squareParentId?: string;
  shopifyId?: string;
  shopifyParentId?: string;
  platformMetadata: Array<{
    platform: 'shopify' | 'square';
    productId: string;
    variantId?: string;
    parentId?: string;
    sku?: string;
    barcode?: string;
    lastSyncedAt: Date;
    syncStatus: 'success' | 'failed' | 'pending';
    lastError?: string;
  }>;
  syncStatus: {
    lastSyncAttempt: Date;
    lastSuccessfulSync: Date;
    errors: Array<{
      date: Date;
      platform: 'shopify' | 'square';
      error: string;
    }>;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface NewProduct {
  _id?: ObjectId;
  baseProductName: string;
  variantName: string;
  name: string;
  description?: string;
  category: string;
  sku: string;
  barcode?: string;
  price: number;
  stock: number;
  minimumStock: number;
  lastPurchasePrice: number;
  averageCost: number;
  supplier?: string;
  isProxied: boolean;
  proxyOf?: ObjectId;
  proxyRatio?: number;
  costHistory: Array<{
    date: Date;
    cost: number;
    quantity: number;
    source: 'wholesale' | 'manual' | 'square' | 'shopify';
    reference?: string;
  }>;
  totalSpent: number;
  totalPurchased: number;
  lastRestockDate?: Date;
  active: boolean;
  platformMetadata: Array<{
    platform: 'shopify' | 'square';
    productId: string;
    variantId?: string;
    parentId?: string;
    sku?: string;
    barcode?: string;
    lastSyncedAt: Date;
    syncStatus: 'success' | 'failed' | 'pending';
    lastError?: string;
  }>;
  syncStatus: {
    lastSyncAttempt: Date;
    lastSuccessfulSync: Date;
    errors: Array<{
      date: Date;
      platform: 'shopify' | 'square';
      error: string;
    }>;
  };
  createdAt: Date;
  updatedAt: Date;
}

async function migrateProducts() {
  try {
    const { db } = await connectToDatabase()
    console.log('Connected to database')

    // Get all products from products_new collection
    const oldProducts = await db.collection('products_new').find({}).toArray()
    console.log(`Found ${oldProducts.length} products to migrate`)

    const newProducts: NewProduct[] = []
    let processedCount = 0
    let errorCount = 0

    // Process each product
    for (const oldProduct of oldProducts) {
      try {
        // Extract baseProductName and variantName from name
        const nameParts = oldProduct.name.split(' - ')
        const baseProductName = nameParts[0]
        const variantName = nameParts.length > 1 ? nameParts[1] : 'Default'

        // Create new product document
        const newProduct: NewProduct = {
          _id: oldProduct._id, // Keep the same _id
          baseProductName,
          variantName,
          name: oldProduct.name,
          description: oldProduct.description || '',
          category: oldProduct.category,
          sku: oldProduct.name.toLowerCase().replace(/[^a-z0-9]/g, '-'), // Generate SKU from name
          price: oldProduct.retailPrice,
          stock: oldProduct.currentStock,
          minimumStock: oldProduct.minimumStock,
          lastPurchasePrice: oldProduct.lastPurchasePrice,
          averageCost: oldProduct.averageCost,
          supplier: oldProduct.supplier || '',
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
        }

        newProducts.push(newProduct)
        processedCount++

        // Log progress every 100 products
        if (processedCount % 100 === 0) {
          console.log(`Processed ${processedCount} products...`)
        }
      } catch (error) {
        console.error(`Error processing product ${oldProduct._id}:`, error)
        errorCount++
      }
    }

    // Insert all new products into a temporary collection
    if (newProducts.length > 0) {
      console.log(`Inserting ${newProducts.length} new products...`)
      const result = await db.collection('products_new_schema').insertMany(newProducts)
      console.log(`Inserted ${result.insertedCount} products`)
    }

    // Create indexes on the new collection
    console.log('Creating indexes...')
    await db.collection('products_new_schema').createIndex({ baseProductName: 1 })
    await db.collection('products_new_schema').createIndex({ sku: 1 }, { unique: true })
    await db.collection('products_new_schema').createIndex({ category: 1 })
    await db.collection('products_new_schema').createIndex({ stock: 1 })
    await db.collection('products_new_schema').createIndex({ active: 1 })
    await db.collection('products_new_schema').createIndex({ 'platformMetadata.productId': 1 })
    await db.collection('products_new_schema').createIndex({ 'platformMetadata.sku': 1 })

    console.log('\nMigration Summary:')
    console.log(`Total products processed: ${processedCount}`)
    console.log(`Successful migrations: ${newProducts.length}`)
    console.log(`Errors encountered: ${errorCount}`)

  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

// Run the migration
migrateProducts()
  .then(() => {
    console.log('Migration completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  }) 