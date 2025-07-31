import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'
import { updateInventoryForExistingTransaction, convertModalLineItemsToInventoryFormat, restoreInventoryForDeletedTransaction, type InventoryUpdateResult } from '@/lib/utils/inventory-management'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    const updateData = await request.json()
    delete updateData._id

    // Convert date fields to Date objects if they're strings (same logic as POST route)
    if (updateData.date && typeof updateData.date === 'string') {
      updateData.date = new Date(updateData.date)
    }
    if (updateData.createdAt && typeof updateData.createdAt === 'string') {
      updateData.createdAt = new Date(updateData.createdAt)
    }

    // Update inventory for Viva Raw products if this is a sale transaction with products being updated
    let inventoryResults: InventoryUpdateResult[] = []
    if (updateData.type === 'sale' && updateData.products && Array.isArray(updateData.products) && updateData.products.length > 0) {
      try {
        const inventoryProducts = convertModalLineItemsToInventoryFormat(updateData.products)
        inventoryResults = await updateInventoryForExistingTransaction(params.id, inventoryProducts)
        console.log(`[API] Inventory update results for transaction ${params.id}:`, inventoryResults)
      } catch (error) {
        console.error(`[API] Error updating inventory for transaction ${params.id}:`, error)
      }
    }

    const result = await mongoose.connection.db!.collection('transactions').updateOne(
      { _id: new mongoose.Types.ObjectId(params.id) },
      { 
        $set: {
          ...updateData,
          updatedAt: new Date()
        } 
      }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ 
      success: true,
      inventoryResults: inventoryResults.length > 0 ? inventoryResults : undefined
    })
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
    
    const transaction = await mongoose.connection.db!.collection('transactions').findOne({
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
    
    // Convert invoiceEmailId to ObjectId if it's being updated
    if (updates.invoiceEmailId) {
      if (!mongoose.Types.ObjectId.isValid(updates.invoiceEmailId)) {
        console.error('[API] Invalid invoiceEmailId provided:', updates.invoiceEmailId);
        return NextResponse.json(
          { error: 'Invalid invoiceEmailId format' },
          { status: 400 }
        );
      }
      updates.invoiceEmailId = new mongoose.Types.ObjectId(updates.invoiceEmailId);
    }
    
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
        const transaction = await mongoose.connection.db!.collection('transactions').findOne({ _id: new mongoose.Types.ObjectId(params.id) });
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

    // Update inventory for Viva Raw products if products are being updated
    let inventoryResults: InventoryUpdateResult[] = []
    if (updates.products && Array.isArray(updates.products) && updates.products.length > 0) {
      try {
        const inventoryProducts = convertModalLineItemsToInventoryFormat(updates.products)
        inventoryResults = await updateInventoryForExistingTransaction(params.id, inventoryProducts)
        console.log(`[API] Inventory update results for transaction ${params.id}:`, inventoryResults)
      } catch (error) {
        console.error(`[API] Error updating inventory for transaction ${params.id}:`, error)
      }
    }

    const result = await mongoose.connection.db!.collection('transactions').updateOne(
      { _id: new mongoose.Types.ObjectId(params.id) },
      { 
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      }
    );

    console.log('[API] Update result:', {
      matched: result.matchedCount,
      modified: result.modifiedCount,
      acknowledged: result.acknowledged
    });

    if (result.matchedCount === 0) {
      console.error('[API] Transaction not found:', params.id);
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    console.log('[API] Successfully updated transaction:', {
      id: params.id,
      updatedFields: Object.keys(updates),
      modified: result.modifiedCount > 0
    });

    return NextResponse.json({ 
      success: true,
      modified: result.modifiedCount > 0,
      inventoryResults: inventoryResults.length > 0 ? inventoryResults : undefined
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update transaction' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase();
    const { id } = params;

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid transaction ID format' },
        { status: 400 }
      );
    }

    // Restore inventory for Viva Raw products before deleting the transaction
    let inventoryResults: InventoryUpdateResult[] = []
    try {
      inventoryResults = await restoreInventoryForDeletedTransaction(id)
      console.log(`[API] Inventory restoration results for deleted transaction ${id}:`, inventoryResults)
    } catch (error) {
      console.error(`[API] Error restoring inventory for deleted transaction ${id}:`, error)
    }

    const result = await mongoose.connection.db!.collection('transactions').deleteOne({ 
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      console.log(`[API] Transaction not found for deletion: ${id}`);
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    console.log(`[API] Successfully deleted transaction: ${id}`);
    return NextResponse.json({ 
      success: true, 
      message: 'Transaction deleted successfully',
      inventoryResults: inventoryResults.length > 0 ? inventoryResults : undefined
    });
  } catch (error) {
    console.error('[API] Error deleting transaction:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete transaction' },
      { status: 500 }
    );
  }
} 