import { NextResponse } from 'next/server'
import { gmailService } from '@/lib/gmail'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const db = await getDb()
    
    // Get stored credentials (you'll need to implement this)
    const credentials = await db.collection('credentials').findOne({ type: 'gmail' })
    if (!credentials) {
      return NextResponse.json(
        { error: 'Gmail not authenticated' },
        { status: 401 }
      )
    }

    gmailService.setCredentials(credentials)

    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since')
      ? new Date(searchParams.get('since')!)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days

    const transactions = await gmailService.fetchAmexEmails(since)
    
    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Error fetching Gmail transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
} 