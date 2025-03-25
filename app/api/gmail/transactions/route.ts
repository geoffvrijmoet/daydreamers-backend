import { NextResponse } from 'next/server'
import { gmailService } from '@/lib/gmail'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

// Mark route as dynamic
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await connectToDatabase()
    
    // Get stored credentials (you'll need to implement this)
    const credentials = await mongoose.model('Credential').findOne({ type: 'gmail' })
    if (!credentials) {
      return NextResponse.json(
        { error: 'Gmail not authenticated' },
        { status: 401 }
      )
    }

    gmailService.setCredentials(credentials.data)

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