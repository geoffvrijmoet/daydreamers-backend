import mongoose from 'mongoose';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
config({ path: path.resolve(__dirname, '../.env.local') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

// After validation, MONGODB_URI is guaranteed to be a string
const uri: string = MONGODB_URI;

// Define the interface for the cached mongoose connection
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  lastAccess: number;
}

// Declare the global type
declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache | undefined;
}

// Global is used here to maintain a cached connection across hot reloads
// in development. This prevents connections growing exponentially
// during API Route usage.
const cached: MongooseCache = global.mongoose || { 
  conn: null, 
  promise: null,
  lastAccess: 0
};

if (!global.mongoose) {
  global.mongoose = cached;
}

export async function connectToDatabase() {
  const now = Date.now();

  // Log connection attempt with details
  console.log('MongoDB connection attempt:', {
    hasConn: !!cached.conn,
    hasPromise: !!cached.promise,
    timeSinceLastAccess: cached.lastAccess ? (now - cached.lastAccess) / 1000 : 'never',
    readyState: cached.conn?.connection?.readyState
  });

  // If we have a cached connection that's connected or connecting, use it
  if (cached.conn) {
    const readyState = cached.conn.connection.readyState;
    if (readyState === 1) { // Connected
      console.log('Using existing connected MongoDB connection');
      cached.lastAccess = now;
      return cached.conn;
    } else if (readyState === 2) { // Connecting
      console.log('Waiting for existing MongoDB connection attempt...');
      cached.lastAccess = now;
      return cached.promise;
    }
    // If readyState is 0 (disconnected) or 3 (disconnecting), proceed to reconnect
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: true,
      maxPoolSize: 10,
      minPoolSize: 5,
      socketTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 1000,
    };

    console.log('Creating new MongoDB connection...');
    cached.promise = mongoose.connect(uri, opts)
      .then((mongoose) => {
        console.log('New MongoDB connection established');
        
        // Set up connection event listeners
        mongoose.connection.on('connected', () => console.log('MongoDB connected'));
        mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));
        mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));
        mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
        
        return mongoose;
      })
      .catch((err) => {
        console.error('MongoDB connection error:', err);
        cached.promise = null;
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
    cached.lastAccess = now;
    return cached.conn;
  } catch (e) {
    cached.promise = null;
    console.error('Failed to connect to MongoDB:', e);
    throw e;
  }
} 