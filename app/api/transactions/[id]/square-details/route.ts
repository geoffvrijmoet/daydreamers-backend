import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    
    // Get the transaction from MongoDB
    const transaction = await mongoose.model('Transaction').findOne({
      _id: new mongoose.Types.ObjectId(params.id)
    })

    if (!transaction || transaction.source !== 'square') {
      return NextResponse.json(
        { error: 'Transaction not found or not a Square transaction' },
        { status: 404 }
      )
    }

    // Extract Square order ID from our internal ID
    const squareOrderId = transaction.id.replace('square_', '')
    
    console.log('[API] Fetching Square order details:', {
      transactionId: transaction._id,
      squareOrderId
    })

    // Fetch fresh order details from Square
    const { result: squareResult } = await squareClient.ordersApi.retrieveOrder(squareOrderId)
    const order = squareResult.order

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found in Square' },
        { status: 404 }
      )
    }

    // Calculate tax amounts using our new logic
    const TAX_RATE = 0.08875;
    const totalAmount = order.totalMoney?.amount ? Number(order.totalMoney.amount) / 100 : transaction.amount;
    const tipAmount = order.tenders?.[0]?.tipMoney?.amount 
      ? Number(order.tenders[0].tipMoney.amount) / 100 
      : 0;
    
    // Subtotal includes tax but not tip
    const subtotal = totalAmount - tipAmount;
    // Work backwards to find pre-tax amount
    const preTaxAmount = subtotal / (1 + TAX_RATE);
    const calculatedTax = subtotal - preTaxAmount;

    console.log('[API] Square tax calculation:', {
      totalAmount,
      tipAmount,
      subtotal,
      preTaxAmount,
      calculatedTax,
      effectiveTaxRate: ((calculatedTax / preTaxAmount) * 100).toFixed(3) + '%'
    });

    // Update transaction with fresh data
    const updates = {
      amount: totalAmount,
      preTaxAmount,
      taxAmount: calculatedTax,
      tip: tipAmount || undefined,
      status: order.state === 'CANCELED' ? 'cancelled' : transaction.status,
      updatedAt: new Date().toISOString()
    }

    console.log('[API] Updating transaction with fresh Square data:', updates)

    const updatedTransaction = await mongoose.model('Transaction').findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(params.id) },
      { $set: updates },
      { new: true }
    )

    if (!updatedTransaction) {
      return NextResponse.json(
        { error: 'Failed to update transaction' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Successfully updated Square transaction details',
      transaction: updatedTransaction
    })

  } catch (error) {
    console.error('[API] Error fetching Square details:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Square details' },
      { status: 500 }
    )
  }
} 