import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import { gmailService } from '@/lib/gmail'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    console.log('\n=== Starting Basic Gmail Test ===')
    
    // Get credentials
    const db = await getDb()
    const credentials = await db.collection('credentials').findOne({ type: 'gmail' })
    
    if (!credentials?.data) {
      console.log('❌ No Gmail credentials found')
      return NextResponse.json({ error: 'Gmail not authenticated' }, { status: 401 })
    }

    console.log('✓ Found credentials:', {
      hasAccessToken: !!credentials.data.accessToken,
      hasRefreshToken: !!credentials.data.refreshToken,
      expiryDate: credentials.data.expiryDate
    })

    // Set credentials
    gmailService.setCredentials(credentials.data)

    // Test Gmail API access
    const gmail = google.gmail({ version: 'v1', auth: gmailService.oauth2Client })
    
    // First, test profile access
    console.log('\nTesting profile access...')
    const profile = await gmail.users.getProfile({ userId: 'me' })
    console.log('✓ Successfully accessed Gmail profile:', profile.data.emailAddress)

    // Try to get any emails at all
    console.log('\nTesting basic email access...')
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 3
    })

    if (!response.data.messages) {
      console.log('❌ No emails found at all')
      return NextResponse.json({ message: 'No emails found' })
    }

    console.log(`✓ Found ${response.data.messages.length} recent emails`)

    // Get details of first email
    const firstEmail = await gmail.users.messages.get({
      userId: 'me',
      id: response.data.messages[0].id!,
      format: 'full'
    })

    const headers = firstEmail.data.payload?.headers
    const subject = headers?.find(h => h.name.toLowerCase() === 'subject')?.value
    const from = headers?.find(h => h.name.toLowerCase() === 'from')?.value
    const date = headers?.find(h => h.name.toLowerCase() === 'date')?.value

    console.log('\nMost recent email:', {
      subject,
      from,
      date
    })

    return NextResponse.json({
      success: true,
      profile: profile.data.emailAddress,
      emailCount: response.data.messages.length,
      sampleEmail: {
        subject,
        from,
        date
      }
    })

  } catch (error) {
    console.error('Gmail test error:', error)
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gmail test failed' },
      { status: 500 }
    )
  }
} 