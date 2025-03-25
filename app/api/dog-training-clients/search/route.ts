import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import mongoose from 'mongoose';
import { Db } from 'mongodb';

/**
 * GET /api/dog-training-clients/search
 * 
 * Searches for dog training clients by name or dog name
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  const searchDogs = searchParams.get('includeDogs') === 'true';
  
  if (!query || query.length < 2) {
    return NextResponse.json({ 
      success: true, 
      clients: [] 
    });
  }

  try {
    await connectToDatabase();
    
    // Base query for client name search
    const baseQuery = { 
      name: { 
        $regex: query, 
        $options: 'i' 
      } 
    };
    
    // Prepare the MongoDB query based on search parameters
    const clientsQuery = searchDogs
      ? { $or: [baseQuery, { 'dogs.name': { $regex: query, $options: 'i' } }] }
      : baseQuery;
    
    // Fetch clients matching the query
    const clients = await (mongoose.connection.db as Db).collection('dogTrainingClients')
      .find(clientsQuery)
      .project({ 
        _id: 1, 
        id: 1, 
        name: 1, 
        phone: 1, 
        email: 1,
        dogs: 1,
        // Include revenue data
        sessionCount: 1,
        totalRevenue: 1,
        totalSales: 1,
        totalTax: 1,
        firstSessionDate: 1,
        mostRecentSessionDate: 1,
        trainingSessions: 1
      })
      .limit(10)
      .toArray();
    
    return NextResponse.json({ 
      success: true, 
      clients 
    });
  } catch (error) {
    console.error('Error searching dog training clients:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to search dog training clients' },
      { status: 500 }
    );
  }
} 