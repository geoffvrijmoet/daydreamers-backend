import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

export async function POST(request: Request) {
  try {
    await connectToDatabase()
    const { transactions } = await request.json()
    
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No transactions provided' },
        { status: 400 }
      )
    }
    
    console.log(`Received ${transactions.length} transactions for batch import`)
    
    const now = new Date().toISOString()
    const preparedTransactions = transactions.map(transaction => ({
      ...transaction,
      createdAt: transaction.createdAt || now,
      updatedAt: transaction.updatedAt || now
    }))
    
    // Insert all transactions at once
    const result = await mongoose.model('Transaction').insertMany(preparedTransactions)
    
    if (!result.length) {
      return NextResponse.json(
        { success: false, error: 'Failed to insert transactions' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({ 
      success: true, 
      importedCount: result.length,
      ids: result.map(doc => doc._id)
    })
  } catch (error) {
    console.error('Error batch importing transactions:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 