import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    const transactionId = params.id

    const result = await mongoose.model('Transaction').updateOne(
      { id: transactionId },
      { 
        $set: { 
          status: 'void',
          voidedAt: new Date().toISOString()
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
    console.error('Error voiding transaction:', error)
    return NextResponse.json(
      { error: 'Failed to void transaction' },
      { status: 500 }
    )
  }
} 