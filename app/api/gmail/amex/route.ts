import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = await getDb()
    
    // Get all stored transactions
    const transactions = await db.collection('transactions')
      .find({ 
        source: 'gmail',
        type: 'purchase'  // Only get AMEX purchases
      })
      .project({
        id: 1,
        date: 1,
        amount: 1,
        description: 1,
        emailId: 1,
        source: 1,
        type: 1,
        cardLast4: 1,
        supplier: 1,  // Explicitly include supplier
        supplierOrderNumber: 1,
        products: 1,
        updatedAt: 1,
        createdAt: 1,
        _id: 1
      })
      .sort({ date: -1 })
      .toArray()

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Error in GET /api/gmail/amex:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
} 