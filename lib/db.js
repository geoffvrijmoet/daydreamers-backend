const dotenv = require('dotenv')
const { resolve } = require('path')
const { MongoClient } = require('mongodb')

// Load environment variables from .env.local first
const envPath = resolve(process.cwd(), '.env.local')
dotenv.config({ path: envPath })

const uri = process.env.MONGODB_URI
let client
let clientPromise

if (!uri) {
  throw new Error('Please add your Mongo URI to .env.local')
}

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  client = new MongoClient(uri)
  clientPromise = client.connect()
}

async function getDb() {
  const client = await clientPromise
  const dbName = process.env.MONGODB_DB
  
  if (!dbName) {
    throw new Error('MONGODB_DB environment variable is not defined')
  }
  
  return client.db(dbName)
}

module.exports = { getDb, clientPromise } 