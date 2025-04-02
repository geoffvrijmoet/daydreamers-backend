import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import TransactionModel from '@/lib/models/transaction'

interface TransactionQuery {
  date?: {
    $gte?: Date;
    $lte?: Date;
  };
  type?: string;
}

export async function GET(request: Request) {
  try {
    await connectToDatabase()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const type = searchParams.get('type')
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : undefined

    const query: TransactionQuery = {}
    
    // Improved date range handling
    if (startDate || endDate) {
      query.date = {}
      
      if (startDate) {
        // Create date from the startDate string and ensure it's a Date object
        const start = new Date(startDate)
        // Set time to beginning of day (00:00:00.000)
        start.setUTCHours(0, 0, 0, 0)
        query.date.$gte = start
        console.log('Start date:', start.toISOString())
      }
      
      if (endDate) {
        // Create date from the endDate string and ensure it's a Date object
        const end = new Date(endDate)
        // Set time to end of day (23:59:59.999)
        end.setUTCHours(23, 59, 59, 999)
        query.date.$lte = end
        console.log('End date:', end.toISOString())
      }
    }
    
    if (type) query.type = type

    console.log('Fetching transactions with query:', JSON.stringify(query))
    console.log('Query date type:', query.date?.$gte instanceof Date, query.date?.$lte instanceof Date)

    // Ensure we're using the proper date comparison in MongoDB
    const transactions = await TransactionModel
      .find(query)
      .sort({ date: -1 })
      .limit(limit || 100)
      .lean()
      .exec()

    // Log the first few transactions' dates for debugging
    if (transactions.length > 0) {
      console.log('Sample transaction dates:', 
        transactions.slice(0, 3).map(t => ({
          id: t._id,
          date: t.date,
          type: t.type,
          amount: t.amount
        }))
      )
    }

    // Log the results breakdown
    const breakdown = {
      total: transactions.length,
      sales: transactions.filter(t => t.type === 'sale').length,
      training: transactions.filter(t => t.type === 'training').length,
      expenses: transactions.filter(t => t.type === 'expense').length,
      dateRange: transactions.length > 0 ? {
        earliest: new Date(Math.min(...transactions.map(t => new Date(t.date).getTime()))).toISOString(),
        latest: new Date(Math.max(...transactions.map(t => new Date(t.date).getTime()))).toISOString()
      } : null
    }
    console.log('Transaction breakdown:', JSON.stringify(breakdown, null, 2))

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase()
    const body = await request.json()

    // Ensure the date is properly handled
    const transactionData = {
      ...body,
      date: new Date(body.date) // Convert the ISO string to a Date object
    }

    // Create new transaction using Mongoose
    const transaction = await TransactionModel.create(transactionData)

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    console.error('Error creating transaction:', error)
    return NextResponse.json(
      { error: 'Failed to create transaction' },
      { status: 500 }
    )
  }
} 