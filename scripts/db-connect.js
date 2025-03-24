import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Verify environment variables are loaded
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('MONGODB_DB exists:', !!process.env.MONGODB_DB);

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined in environment variables');
}

if (!process.env.MONGODB_DB) {
  throw new Error('MONGODB_DB is not defined in environment variables');
}

// Connect to MongoDB
export async function connectToDatabase() {
  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(process.env.MONGODB_DB);
    return { client, db };
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
} 