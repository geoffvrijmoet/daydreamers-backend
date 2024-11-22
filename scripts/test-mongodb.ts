import { config } from 'dotenv'
import { resolve } from 'path'
import { getDb } from '../lib/db'

// Load environment variables from .env.local using absolute path
const envPath = resolve(process.cwd(), '.env.local')
console.log('Loading env from:', envPath)
config({ path: envPath })

// Log to verify environment variables are loaded
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Found' : 'Not found')

async function testConnection() {
  try {
    const db = await getDb()
    console.log('Successfully connected to MongoDB')

    // Test product
    const testProduct = {
      name: 'Test Dog Food',
      sku: 'DF-001',
      description: 'Premium dog food for testing',
      lastPurchasePrice: 45.99,
      averageCost: 45.99,
      retailPrice: 89.99,
      currentStock: 10,
      minimumStock: 5,
      supplier: 'Test Supplier',
      category: 'Dog Food',
      active: true,
      costHistory: [],
      totalSpent: 0,
      totalPurchased: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const result = await db.collection('products').insertOne(testProduct)
    console.log('Test product created with ID:', result.insertedId)

    // Verify we can read it back
    const product = await db.collection('products').findOne({ _id: result.insertedId })
    console.log('Retrieved product:', product)

  } catch (error) {
    console.error('MongoDB Test Error:', error)
  }
}

testConnection() 