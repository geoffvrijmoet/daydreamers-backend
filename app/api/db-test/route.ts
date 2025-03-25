import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import mongoose from 'mongoose';

export async function GET() {
  try {
    console.log('Connecting to MongoDB...');
    await connectToDatabase();
    console.log('Connected to MongoDB successfully');
    
    // Get database stats
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }
    
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    return NextResponse.json({
      status: 'success',
      message: 'MongoDB connection successful',
      database: db.databaseName,
      collections: collectionNames,
      connection: {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        readyState: mongoose.connection.readyState
      }
    });
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    return NextResponse.json(
      { 
        status: 'error',
        message: 'Failed to connect to MongoDB',
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 