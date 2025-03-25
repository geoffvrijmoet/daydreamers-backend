import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

export async function POST(request: Request) {
  try {
    const { ids } = await request.json()
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'No transaction IDs provided' },
        { status: 400 }
      )
    }

    await connectToDatabase()
    const result = await mongoose.model('Transaction').deleteMany({
      id: { $in: ids },
      source: 'gmail' // Safety check to only delete Gmail transactions
    })

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount
    })
  } catch (error) {
    console.error('Error deleting transactions:', error)
    return NextResponse.json(
      { error: 'Failed to delete transactions' },
      { status: 500 }
    )
  }
} 