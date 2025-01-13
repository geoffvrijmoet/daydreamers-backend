import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = await getDb()

    // Get the most recent successful sync from either Square or Shopify
    const syncStates = await db.collection('syncState')
      .find({ 
        source: { $in: ['square', 'shopify'] },
        lastSyncStatus: 'success'
      })
      .sort({ lastSuccessfulSync: -1 })
      .limit(1)
      .toArray()

    if (syncStates.length === 0) {
      return NextResponse.json({ lastSuccessfulSync: null })
    }

    return NextResponse.json({
      lastSuccessfulSync: syncStates[0].lastSuccessfulSync,
      source: syncStates[0].source
    })

  } catch (error) {
    console.error('Error fetching last sync date:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch last sync date' },
      { status: 500 }
    )
  }
} 