import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import mongoose from 'mongoose';
import { ObjectId, Db } from 'mongodb';

type RouteContext = {
  params: {
    id: string;
  };
};

/**
 * GET /api/dog-training-clients/[id]
 * 
 * Fetches a single dog training client by ID
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const id = context.params.id;
  
  try {
    await connectToDatabase();
    
    let query = {};
    // Check if the ID is in ObjectId format or a string ID
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      query = { _id: new ObjectId(id) };
    } else {
      query = { id };
    }
    
    const client = await (mongoose.connection.db as Db).collection('dogTrainingClients').findOne(query);
    
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Dog training client not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      client 
    });
  } catch (error) {
    console.error(`Error fetching dog training client (${id}):`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dog training client' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/dog-training-clients/[id]
 * 
 * Updates a dog training client
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  const id = context.params.id;
  
  try {
    const body = await request.json();
    await connectToDatabase();
    
    let query = {};
    // Check if the ID is in ObjectId format or a string ID
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      query = { _id: new ObjectId(id) };
    } else {
      query = { id };
    }
    
    // Get the current client data to handle revenue calculations
    const currentClient = await (mongoose.connection.db as Db).collection('dogTrainingClients').findOne(query);
    if (!currentClient) {
      return NextResponse.json(
        { success: false, error: 'Dog training client not found' },
        { status: 404 }
      );
    }
    
    // Set update timestamp
    const now = new Date().toISOString();
    
    // Prepare update data
    const updateData = {
      ...body,
      updatedAt: now
    };
    
    // Handle revenue fields - ensure we're incrementing, not overwriting
    if (typeof body.totalRevenue === 'number' && body.totalRevenue !== currentClient.totalRevenue) {
      // Client is passing an updated totalRevenue - use it directly
    } else if (body.addRevenue) {
      // Client is passing an amount to add to the total revenue
      updateData.totalRevenue = (currentClient.totalRevenue || 0) + body.addRevenue;
      delete updateData.addRevenue;
    }
    
    if (typeof body.totalSales === 'number' && body.totalSales !== currentClient.totalSales) {
      // Client is passing an updated totalSales - use it directly
    } else if (body.addSales) {
      // Client is passing an amount to add to the total sales
      updateData.totalSales = (currentClient.totalSales || 0) + body.addSales;
      delete updateData.addSales;
    }
    
    if (typeof body.totalTax === 'number' && body.totalTax !== currentClient.totalTax) {
      // Client is passing an updated totalTax - use it directly
    } else if (body.addTax) {
      // Client is passing an amount to add to the total tax
      updateData.totalTax = (currentClient.totalTax || 0) + body.addTax;
      delete updateData.addTax;
    }
    
    if (typeof body.sessionCount === 'number' && body.sessionCount !== currentClient.sessionCount) {
      // Client is passing an updated sessionCount - use it directly
    } else if (body.incrementSessionCount) {
      // Client is passing a flag to increment the session count
      updateData.sessionCount = (currentClient.sessionCount || 0) + 1;
      delete updateData.incrementSessionCount;
    }
    
    // Never update the _id, id, or createdAt fields
    delete updateData._id;
    delete updateData.id;
    delete updateData.createdAt;
    
    // Update client document
    const result = await (mongoose.connection.db as Db).collection('dogTrainingClients').updateOne(
      query,
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Dog training client not found' },
        { status: 404 }
      );
    }
    
    // Fetch the updated client
    const updatedClient = await (mongoose.connection.db as Db).collection('dogTrainingClients').findOne(query);
    
    return NextResponse.json({ 
      success: true, 
      client: updatedClient 
    });
  } catch (error) {
    console.error(`Error updating dog training client (${id}):`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to update dog training client' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dog-training-clients/[id]
 * 
 * Deletes a dog training client
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const id = context.params.id;
  
  try {
    await connectToDatabase();
    
    let query = {};
    // Check if the ID is in ObjectId format or a string ID
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      query = { _id: new ObjectId(id) };
    } else {
      query = { id };
    }
    
    // Delete client document
    const result = await (mongoose.connection.db as Db).collection('dogTrainingClients').deleteOne(query);
    
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Dog training client not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Dog training client deleted successfully' 
    });
  } catch (error) {
    console.error(`Error deleting dog training client (${id}):`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete dog training client' },
      { status: 500 }
    );
  }
} 