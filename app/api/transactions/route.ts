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
        // Create date from the startDate string
        const start = new Date(startDate)
        // Set time to beginning of day (00:00:00.000)
        start.setUTCHours(0, 0, 0, 0)
        query.date.$gte = start
      }
      
      if (endDate) {
        // Create date from the endDate string
        const end = new Date(endDate)
        // Set time to end of day (23:59:59.999)
        end.setUTCHours(23, 59, 59, 999)
        query.date.$lte = end
      }
    }
    
    if (type) query.type = type

    console.log('Fetching transactions with query:', JSON.stringify(query, null, 2))

    const transactions = await TransactionModel
      .find(query)
      .sort({ date: -1 })
      .limit(limit || 100)
      .lean()

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