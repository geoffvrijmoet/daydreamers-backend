import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { type Transaction } from '@/types'

type TransactionQuery = {
  source?: 'square' | 'shopify' | 'gmail' | 'manual';
  type?: 'sale' | 'purchase';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const source = searchParams.get('source') as TransactionQuery['source']
    const type = searchParams.get('type') as TransactionQuery['type']
    
    const db = await getDb()
    
    // Build query based on parameters
    const query: TransactionQuery = {}
    if (source) query.source = source
    if (type) query.type = type

    const transactions = await db.collection('transactions')
      .find(query)
      .sort({ date: -1 })
      .toArray() as unknown as Transaction[]

    return NextResponse.json({ transactions })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch transactions'
    console.error('Error fetching transactions:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
} 