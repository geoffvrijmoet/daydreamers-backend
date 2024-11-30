import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const source = searchParams.get('source')
    const type = searchParams.get('type')
    
    const db = await getDb()
    
    // Build query based on parameters
    const query: any = {}
    if (source) query.source = source
    if (type) query.type = type

    const transactions = await db.collection('transactions')
      .find(query)
      .sort({ date: -1 })
      .toArray()

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
} 