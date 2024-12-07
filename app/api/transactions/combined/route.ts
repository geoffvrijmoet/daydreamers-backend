import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const db = await getDb()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate') || '2023-01-01T00:00:00.000Z'
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    console.log('Fetching sales transactions from MongoDB with params:', {
      startDate,
      endDate
    })

    // First, let's check what's actually in the collection
    const oldestTransaction = await db.collection('transactions')
      .find({ type: 'sale' })
      .sort({ date: 1 })
      .limit(1)
      .toArray()

    const newestTransaction = await db.collection('transactions')
      .find({ type: 'sale' })
      .sort({ date: -1 })
      .limit(1)
      .toArray()

    console.log('Transaction date range in DB:', {
      oldest: oldestTransaction[0]?.date,
      newest: newestTransaction[0]?.date
    })

    // Create date objects for comparison
    const start = new Date(startDate)
    const end = new Date(endDate)

    // Fetch only sales transactions from MongoDB within date range
    const transactions = await db.collection('transactions')
      .find({
        type: 'sale',
        date: {
          $gte: start.toISOString(),
          $lte: end.toISOString()
        }
      })
      .sort({ date: -1 })
      .toArray()

    console.log('Total sales transactions by source and date range:', {
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      counts: {
        manual: transactions.filter(t => t.source === 'manual').length,
        square: transactions.filter(t => t.source === 'square').length,
        shopify: transactions.filter(t => t.source === 'shopify').length,
        total: transactions.length
      },
      oldestReturned: transactions[transactions.length - 1]?.date,
      newestReturned: transactions[0]?.date
    })

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
} 