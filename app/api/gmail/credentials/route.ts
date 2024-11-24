import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { GmailCredentials } from '@/types'

export async function GET() {
  try {
    const db = await getDb()
    const credentials = await db.collection('credentials').findOne({ type: 'gmail' })
    return NextResponse.json({ 
      hasCredentials: !!credentials,
      credentials: credentials?.data || null
    })
  } catch (error) {
    console.error('Error fetching Gmail credentials:', error)
    return NextResponse.json(
      { error: 'Failed to fetch credentials' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const credentials: GmailCredentials = await request.json()
    const db = await getDb()
    
    await db.collection('credentials').updateOne(
      { type: 'gmail' },
      { 
        $set: { 
          type: 'gmail',
          data: credentials,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving Gmail credentials:', error)
    return NextResponse.json(
      { error: 'Failed to save credentials' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    const db = await getDb()
    await db.collection('credentials').deleteOne({ type: 'gmail' })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting Gmail credentials:', error)
    return NextResponse.json(
      { error: 'Failed to delete credentials' },
      { status: 500 }
    )
  }
} 