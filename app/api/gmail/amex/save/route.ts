import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

export async function POST(request: Request) {
  try {
    const transaction = await request.json()
    await connectToDatabase()

    await mongoose.model('Transaction').create({
      ...transaction,
      createdAt: new Date().toISOString()
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving transaction:', error)
    return NextResponse.json(
      { error: 'Failed to save transaction' },
      { status: 500 }
    )
  }
} 