import { MongoClient, Db } from 'mongodb'
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from .env.local
config({ path: path.resolve(__dirname, '../.env.local') })

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable')
}

// After validation, MONGODB_URI is guaranteed to be a string
const uri: string = MONGODB_URI

interface ConnectionPool {
  client: MongoClient | null
  promise: Promise<MongoClient> | null
  lastUsed: number
}

const pool: ConnectionPool = {
  client: null,
  promise: null,
  lastUsed: 0
}

const options = {
  maxPoolSize: 10,
  minPoolSize: 5,
  maxIdleTimeMS: 270000, // 4.5 minutes (below Vercel's 10s timeout)
  waitQueueTimeoutMS: 5000,
  connectTimeoutMS: 5000,
}

async function getClient(): Promise<MongoClient> {
  const now = Date.now()

  // If we have a client and it was used recently, reuse it
  if (pool.client && (now - pool.lastUsed) < 270000) { // 4.5 minutes
    pool.lastUsed = now
    return pool.client
  }

  // If we're already connecting, wait for that connection
  if (pool.promise) {
    console.log('Waiting for existing connection...')
    const client = await pool.promise
    pool.lastUsed = now
    return client
  }

  console.log('Creating new MongoDB connection...')
  // Create new connection
  pool.promise = MongoClient.connect(uri, options)
    .then(client => {
      console.log('New MongoDB connection established')
      pool.client = client
      return client
    })
    .catch(err => {
      console.error('MongoDB connection error:', err)
      pool.promise = null
      pool.client = null
      throw err
    })

  const client = await pool.promise
  pool.lastUsed = now
  return client
}

/**
 * Get a database instance
 * @returns Promise<Db> The database instance
 */
export async function getDb(): Promise<Db> {
  const client = await getClient()
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
  const client = await getClient()
  const dbName = process.env.MONGODB_DB
  
  if (!dbName) {
    throw new Error('MONGODB_DB environment variable is not defined')
  }
  
  return { client, db: client.db(dbName) }
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default getClient() 