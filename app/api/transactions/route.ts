import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface DateQuery {
  date?: {
    $gte?: string;
    $lte?: string;
  };
}

export async function GET(request: Request) {
  try {
    const db = await getDb()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const query: DateQuery = {}
    if (startDate) query.date = { $gte: startDate }
    if (endDate) query.date = { ...query.date, $lte: endDate }

    const transactions = await db.collection('transactions')
      .find(query)
      .sort({ date: -1 })
      .toArray()

    return NextResponse.json({ transactions })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
} 