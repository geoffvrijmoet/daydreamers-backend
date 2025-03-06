import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

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
    const db = await getDb();
    
    // Search for customers with a name containing the query (case insensitive)
    const customers = await db.collection('customers')
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