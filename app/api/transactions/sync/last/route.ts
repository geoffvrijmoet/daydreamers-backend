import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import SyncStateModel from '@/lib/models/SyncState'

export async function GET() {
  try {
    await connectToDatabase()

    // Get the most recent successful sync from either Square or Shopify
    const syncStates = await SyncStateModel
      .find({ 
        source: { $in: ['square', 'shopify'] },
        lastSyncStatus: 'success'
      })
      .sort({ lastSuccessfulSync: -1 })
      .limit(1)

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