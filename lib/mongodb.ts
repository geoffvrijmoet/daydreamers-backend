import { MongoClient, Db } from 'mongodb'
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from .env.local
config({ path: path.resolve(__dirname, '../.env.local') })

if (!process.env.MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local')
}

const uri = process.env.MONGODB_URI
const options = {
  maxPoolSize: 10,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  retryWrites: true,
  retryReads: true,
  w: 'majority' as const,
  readPreference: 'primary' as const,
  maxIdleTimeMS: 60000,
  heartbeatFrequencyMS: 10000,
}

let client: MongoClient
let clientPromise: Promise<MongoClient>

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>
  }

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options)
    globalWithMongo._mongoClientPromise = client.connect()
  }
  clientPromise = globalWithMongo._mongoClientPromise
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

/**
 * Get a database instance
 * @returns Promise<Db> The database instance
 */
export async function getDb(): Promise<Db> {
  const client = await clientPromise
  const dbName = process.env.MONGODB_DB
  
  if (!dbName) {
    throw new Error('MONGODB_DB environment variable is not defined')
  }
  
  return client.db(dbName)
}

/**
 * Get both client and database instances
 * @returns Promise<{ client: MongoClient, db: Db }> The client and database instances
 */
export async function connectToDatabase() {
  try {
    const client = await clientPromise
    const dbName = process.env.MONGODB_DB
    
    if (!dbName) {
      throw new Error('MONGODB_DB environment variable is not defined')
    }
    
    const db = client.db(dbName)
    return { client, db }
  } catch (error) {
    console.error('Error connecting to the database:', error)
    throw error
  }
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default clientPromise 