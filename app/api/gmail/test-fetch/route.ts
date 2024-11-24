import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import { gmailService } from '@/lib/gmail'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    console.log('Starting Gmail API test for Amex Large Transaction emails...')
    
    // Get credentials
    const db = await getDb()
    const credentials = await db.collection('credentials').findOne({ type: 'gmail' })
    
    if (!credentials?.data) {
      console.log('No Gmail credentials found')
      return NextResponse.json({ error: 'Gmail not authenticated' }, { status: 401 })
    }

    // Set credentials
    gmailService.setCredentials(credentials.data)

    // Test Gmail API access
    const gmail = google.gmail({ version: 'v1', auth: gmailService.oauth2Client })
    
    // First, test basic profile access
    console.log('Testing profile access...')
    const profile = await gmail.users.getProfile({ userId: 'me' })
    console.log('Successfully accessed Gmail profile:', profile.data.emailAddress)

    // Search specifically for Large Transaction Approved emails
    const query = 'from:AmericanExpress@welcome.americanexpress.com subject:"Large Transaction Approved"'
    console.log('Using query:', query)

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 10
    })

    if (!response.data.messages) {
      console.log('No Large Transaction emails found')
      return NextResponse.json({ message: 'No Large Transaction emails found' })
    }

    console.log(`Found ${response.data.messages.length} Large Transaction emails`)
    const foundEmails = []

    // Get details of each email
    for (const message of response.data.messages) {
      const email = await gmail.users.messages.get({
        userId: 'me',
        id: message.id!,
        format: 'full'
      })

      const headers = email.data.payload?.headers
      const subject = headers?.find(h => h?.name?.toLowerCase() === 'subject')?.value
      const from = headers?.find(h => h?.name?.toLowerCase() === 'from')?.value
      const date = headers?.find(h => h?.name?.toLowerCase() === 'date')?.value

      // Get the email body
      const body = email.data.payload?.parts?.[0]?.body?.data || email.data.payload?.body?.data
      const decodedBody = body ? Buffer.from(body, 'base64').toString('utf-8') : null

      foundEmails.push({
        id: message.id,
        subject,
        from,
        date,
        snippet: email.data.snippet,
        fullBody: decodedBody
      })

      // Log details for debugging
      console.log('Email details:', {
        id: message.id,
        subject,
        from,
        date,
        bodyPreview: decodedBody?.substring(0, 200)
      })
    }

    return NextResponse.json({
      success: true,
      profile: profile.data.emailAddress,
      totalEmails: foundEmails.length,
      emails: foundEmails
    })

  } catch (error) {
    console.error('Gmail test error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gmail test failed' },
      { status: 500 }
    )
  }
} 