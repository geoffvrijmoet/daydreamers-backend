import { MongoClient } from 'mongodb'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
const envPath = resolve(process.cwd(), '.env.local')
console.log('Loading env from:', envPath)
config({ path: envPath })

// Debug log
console.log('MongoDB URI exists:', !!process.env.MONGODB_URI)

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined in environment variables')
}

const uri = process.env.MONGODB_URI
console.log('Connecting to MongoDB...')

const options = {}

let client: MongoClient
let clientPromise: Promise<MongoClient>

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

// Export a module-scoped MongoClient promise
export const getDb = async () => {
  try {
    const client = await clientPromise
    console.log('Successfully connected to MongoDB')
    return client.db('daydreamers')
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error)
    throw error
  }
} 