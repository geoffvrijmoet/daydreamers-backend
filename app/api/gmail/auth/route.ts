import { NextResponse } from 'next/server'
import { gmailService } from '@/lib/gmail'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const authUrl = gmailService.getAuthUrl()
    return NextResponse.json({ authUrl })
  } catch (error) {
    console.error('Gmail auth URL generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate auth URL' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const { code } = await request.json()
    console.log('Received auth code:', code)

    // Exchange code for tokens
    const credentials = await gmailService.getTokens(code)
    console.log('Received credentials:', {
      accessToken: credentials.accessToken ? 'present' : 'missing',
      refreshToken: credentials.refreshToken ? 'present' : 'missing',
      expiryDate: credentials.expiryDate
    })

    // Store credentials in database
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
    console.error('Gmail auth error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to authenticate with Gmail' },
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
    console.error('Gmail credentials deletion error:', error)
    return NextResponse.json(
      { error: 'Failed to delete Gmail credentials' },
      { status: 500 }
    )
  }
} 