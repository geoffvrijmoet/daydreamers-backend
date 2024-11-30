import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const transaction = await request.json()
    const db = await getDb()

    await db.collection('transactions').insertOne({
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