import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { ObjectId } from 'mongodb'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    console.log('[API] Received profit calculation save request for transaction:', params.id);
    
    const db = await getDb()
    const { profitDetails, taxDetails, calculatedAt } = await request.json()
    
    console.log('[API] Profit calculation data:', {
      transactionId: params.id,
      calculatedAt,
      totalProfit: profitDetails.totalProfit,
      totalCost: profitDetails.totalCost,
      totalRevenue: profitDetails.totalRevenue,
      itemCount: profitDetails.lineItemProfits.length,
      itemsWithoutCost: profitDetails.itemsWithoutCost,
      taxAmount: taxDetails.taxAmount,
      preTaxAmount: taxDetails.preTaxAmount
    });

    // Update the transaction with profit details and tax calculation
    const result = await db.collection('transactions').findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      {
        $set: {
          profitCalculation: {
            ...profitDetails,
            calculatedAt
          },
          taxAmount: taxDetails.taxAmount,
          preTaxAmount: taxDetails.preTaxAmount,
          updatedAt: new Date().toISOString()
        }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      console.error('[API] Transaction not found:', params.id);
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    console.log('[API] Successfully saved profit calculation:', {
      transactionId: params.id,
      updatedAt: result.updatedAt,
      taxAmount: result.taxAmount,
      preTaxAmount: result.preTaxAmount
    });

    return NextResponse.json(result)
  } catch (error) {
    console.error('[API] Error saving profit calculation:', {
      transactionId: params.id,
      error: error instanceof Error ? error.message : error
    });
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save profit calculation' },
      { status: 500 }
    )
  }
} 