import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    const updateData = await request.json()
    delete updateData._id

    const result = await mongoose.model('Transaction').updateOne(
      { id: params.id },
      { 
        $set: {
          ...updateData,
          updatedAt: new Date().toISOString()
        } 
      }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating transaction:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update transaction' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    
    const transaction = await mongoose.model('Transaction').findOne({
      _id: new mongoose.Types.ObjectId(params.id)
    })

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(transaction)
  } catch (error) {
    console.error('Error fetching transaction:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transaction' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const updates = await request.json();
    await connectToDatabase();
    
    // Log the incoming update request
    console.log(`[API] Updating transaction ${params.id}:`, updates);
    
    // Validate amount if it's being updated
    if (updates.amount !== undefined) {
      const numericAmount = Number(updates.amount);
      if (isNaN(numericAmount)) {
        console.error('[API] Invalid amount provided:', updates.amount);
        return NextResponse.json(
          { error: 'Invalid amount provided' },
          { status: 400 }
        );
      }
      
      // Ensure amount is a number in the updates
      updates.amount = numericAmount;
      
      // If we're updating the amount, we might need to update related fields
      // Calculate pre-tax amount if not explicitly provided
      if (updates.preTaxAmount === undefined) {
        const transaction = await mongoose.model('Transaction').findOne({ _id: new mongoose.Types.ObjectId(params.id) });
        if (transaction) {
          // If transaction has a tax amount, update the pre-tax amount calculation
          if (transaction.taxAmount) {
            updates.preTaxAmount = numericAmount - transaction.taxAmount;
          } else {
            // If no tax, pre-tax is the same as amount
            updates.preTaxAmount = numericAmount;
          }
        }
      }
    }

    const result = await mongoose.model('Transaction').findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(params.id) },
      { 
        $set: {
          ...updates,
          updatedAt: new Date().toISOString()
        }
      },
      { new: true }
    );

    if (!result) {
      console.error('[API] Transaction not found:', params.id);
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    console.log('[API] Successfully updated transaction:', {
      id: result._id,
      updatedFields: Object.keys(updates)
    });

    return NextResponse.json({ 
      success: true,
      transaction: result 
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update transaction' },
      { status: 500 }
    );
  }
} 