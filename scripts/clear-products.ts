import { config } from 'dotenv'
import { resolve } from 'path'
import { getDb } from '../lib/db'

// Load environment variables from .env.local using absolute path
const envPath = resolve(process.cwd(), '.env.local')
console.log('Loading env from:', envPath)
config({ path: envPath })

// Add debug logging
console.log('Environment check:', {
  MONGODB_URI: process.env.MONGODB_URI ? 'Found' : 'Not found',
  cwd: process.cwd(),
  envPath
})

// Verify environment variables are loaded
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI not found in environment variables')
  console.log('Available environment variables:', Object.keys(process.env))
  process.exit(1)
}

async function clearProducts() {
  try {
    console.log('Connecting to MongoDB...')
    const db = await getDb()
    
    // Delete all documents from the products collection
    const result = await db.collection('products').deleteMany({})
    
    console.log(`Cleared ${result.deletedCount} products from database`)
    
    // Verify collection is empty
    const count = await db.collection('products').countDocuments()
    console.log(`Products collection now has ${count} documents`)
    
    process.exit(0)
  } catch (error) {
    console.error('Error clearing products:', error)
    console.error('Full error:', error instanceof Error ? error.stack : error)
    process.exit(1)
  }
}

clearProducts() 