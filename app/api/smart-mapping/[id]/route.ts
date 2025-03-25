import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import mongoose from 'mongoose';
import { ObjectId, Db } from 'mongodb';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    
    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Mapping ID is required' },
        { status: 400 }
      );
    }
    
    await connectToDatabase();
    const collection = (mongoose.connection.db as Db).collection('smart_mappings');
    
    // Convert string ID to ObjectId
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid mapping ID format' },
        { status: 400 }
      );
    }
    
    // Check if the mapping exists
    const mapping = await collection.findOne({ _id: objectId });
    
    if (!mapping) {
      return NextResponse.json(
        { success: false, message: 'Mapping not found' },
        { status: 404 }
      );
    }
    
    // Delete the mapping
    const result = await collection.deleteOne({ _id: objectId });
    
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: 'Failed to delete mapping' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { success: true, message: 'Mapping deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting mapping:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
} 