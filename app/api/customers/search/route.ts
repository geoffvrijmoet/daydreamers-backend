import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import mongoose from 'mongoose';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  
  if (!query || query.length < 2) {
    return NextResponse.json({ 
      success: true, 
      customers: [] 
    });
  }

  try {
    await connectToDatabase();
    
    // Search for customers with a name containing the query (case insensitive)
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
    const customers = await db
      .collection('customers')
      .find({
        name: {
          $regex: query,
          $options: 'i'
        }
      })
      .project({ name: 1, _id: 0 })
      .limit(10)
      .toArray();
    
    return NextResponse.json({ 
      success: true, 
      customers 
    });
  } catch (error) {
    console.error('Error searching customers:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to search customers' },
      { status: 500 }
    );
  }
} 