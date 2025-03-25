import { config } from 'dotenv'
import { resolve } from 'path'
import { connectToDatabase } from '../lib/mongoose'
import mongoose from 'mongoose'

// Load environment variables from .env.local using absolute path
const envPath = resolve(process.cwd(), '.env.local')
console.log('Loading env from:', envPath)
config({ path: envPath })

// Log to verify environment variables are loaded
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Found' : 'Not found')

async function setupDatabase() {
  try {
    await connectToDatabase()
    
    // Create indexes
    await (mongoose.connection.db as any).collection('products').createIndexes([
      { key: { sku: 1 }, unique: true },
      { key: { name: 1 } },
      { key: { category: 1 } },
      { key: { currentStock: 1 } },
      { key: { lastRestockDate: 1 } }
    ])

    console.log('MongoDB indexes created successfully')

    // Create some sample products
    const sampleProducts = [
      {
        name: 'Premium Dog Food',
        sku: 'DF-001',
        description: 'High-quality dog food',
        lastPurchasePrice: 45.99,
        averageCost: 45.99,
        retailPrice: 89.99,
        currentStock: 20,
        minimumStock: 10,
        supplier: 'Pet Food Direct',
        category: 'Dog Food',
        active: true,
        costHistory: [],
        totalSpent: 0,
        totalPurchased: 0
      },
      {
        name: 'Cat Litter',
        sku: 'CL-001',
        description: 'Clumping cat litter',
        lastPurchasePrice: 12.99,
        averageCost: 12.99,
        retailPrice: 24.99,
        currentStock: 15,
        minimumStock: 8,
        supplier: 'Pet Supplies Plus',
        category: 'Cat Supplies',
        active: true,
        costHistory: [],
        totalSpent: 0,
        totalPurchased: 0
      }
    ]

    const result = await (mongoose.connection.db as any).collection('products').insertMany(
      sampleProducts.map(product => ({
        ...product,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }))
    )

    console.log('Sample products created:', result.insertedIds)

  } catch (error) {
    console.error('MongoDB Setup Error:', error)
  }
}

setupDatabase() 