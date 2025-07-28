import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.log('[API] Fee update request received:', {
    transactionId: params.id
  });

  try {
    const { processingFee } = await request.json();
    
    if (typeof processingFee !== 'number' || processingFee < 0) {
      return NextResponse.json(
        { error: 'Invalid processing fee' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    
    // Update the transaction with the new fee
    console.log('[API] Updating transaction in MongoDB...');
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
    const result = await db.collection('transactions').findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      { 
        $set: { 
          shopifyProcessingFee: processingFee,
          updatedAt: new Date().toISOString()
        } 
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      console.error('[API] Failed to update transaction in MongoDB');
      return NextResponse.json(
        { error: 'Failed to update transaction' },
        { status: 500 }
      );
    }

    console.log('[API] Successfully updated transaction fee:', {
      transactionId: params.id,
      newFee: processingFee
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Error updating fee:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 