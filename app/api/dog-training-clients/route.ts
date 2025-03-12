import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { DogTrainingClientSchema, DogSchema, createDogTrainingClientId } from '@/lib/models/dog-training-client';

/**
 * GET /api/dog-training-clients
 * 
 * Fetches a list of dog training clients, with optional filtering
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const isActive = searchParams.get('isActive') === 'true';
  const query: Record<string, unknown> = {};
  
  // Apply isActive filter if specified
  if (searchParams.has('isActive')) {
    query.isActive = isActive;
  }
  
  try {
    const db = await getDb();
    
    const clients = await db.collection('dogTrainingClients')
      .find(query)
      .limit(limit)
      .sort({ name: 1 })
      .toArray();
    
    return NextResponse.json({ 
      success: true, 
      clients 
    });
  } catch (error) {
    console.error('Error fetching dog training clients:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dog training clients' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dog-training-clients
 * 
 * Creates a new dog training client
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = await getDb();
    
    // Set creation timestamp
    const now = new Date().toISOString();
    
    // Create client document
    const newClient: Partial<DogTrainingClientSchema> = {
      id: createDogTrainingClientId(),
      name: body.name,
      email: body.email,
      phone: body.phone,
      address: body.address,
      dogs: body.dogs?.map((dog: Partial<DogSchema>) => ({
        ...dog,
        createdAt: now,
        updatedAt: now
      })) || [],
      trainingSessions: body.trainingSessions || [],
      sessionCount: body.sessionCount || 0,
      totalRevenue: body.totalRevenue || 0,
      totalSales: body.totalSales || 0,
      totalTax: body.totalTax || 0,
      referredBy: body.referredBy,
      notes: body.notes,
      isActive: body.isActive !== false, // Default to true
      firstSessionDate: body.firstSessionDate,
      mostRecentSessionDate: body.mostRecentSessionDate,
      createdAt: now,
      updatedAt: now
    };
    
    const result = await db.collection('dogTrainingClients').insertOne(newClient);
    
    return NextResponse.json({ 
      success: true, 
      client: {
        ...newClient,
        _id: result.insertedId
      }
    });
  } catch (error) {
    console.error('Error creating dog training client:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create dog training client' },
      { status: 500 }
    );
  }
} 