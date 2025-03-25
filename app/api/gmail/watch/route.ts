import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { google } from 'googleapis'
import { gmailService } from '@/lib/gmail'
import { OAuth2Client } from 'google-auth-library'

// Initialize the auth client for verification
const auth = new OAuth2Client({
  clientId: process.env.GOOGLE_CLOUD_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLOUD_CLIENT_SECRET
})

// Verify the authentication token
async function verifyAuthToken(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.split('Bearer ')[1]
  try {
    const ticket = await auth.verifyIdToken({
      idToken: token,
      audience: `https://pubsub.googleapis.com/projects/${process.env.GOOGLE_CLOUD_PROJECT}/topics/${process.env.GMAIL_TOPIC_NAME}`
    })
    return ticket.getPayload()
  } catch (error) {
    console.error('Auth verification failed:', error)
    return false
  }
}

// Set up Gmail push notifications
export async function POST() {
  try {
    // Initialize Gmail service with credentials
    await gmailService.initialize()

    await connectToDatabase()
    const credentials = await mongoose.model('Credential').findOne({ type: 'gmail' })
    
    if (!credentials?.data) {
      return NextResponse.json(
        { error: 'Gmail not authenticated' },
        { status: 401 }
      )
    }

    gmailService.setCredentials(credentials.data)
    const gmail = google.gmail({ version: 'v1', auth: gmailService.getAuth() })

    // Set up push notifications
    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        labelIds: ['INBOX'],
        topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT}/topics/${process.env.GMAIL_TOPIC_NAME}`
      }
    })

    // Store the watch expiration
    await mongoose.model('Setting').updateOne(
      { key: 'gmail_watch' },
      { 
        $set: { 
          historyId: response.data.historyId,
          expiration: response.data.expiration,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    )

    return NextResponse.json({
      success: true,
      expiration: response.data.expiration,
      historyId: response.data.historyId
    })
  } catch (error) {
    console.error('Error setting up Gmail watch:', error)
    return NextResponse.json(
      { error: 'Failed to set up Gmail notifications' },
      { status: 500 }
    )
  }
}

// Handle incoming notifications from Gmail
export async function PUT(request: Request) {
  try {
    // Initialize Gmail service with credentials
    await gmailService.initialize()

    // Verify authentication
    const authPayload = await verifyAuthToken(request)
    if (!authPayload) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    await connectToDatabase()
    
    // Get Gmail credentials
    const credentials = await mongoose.model('Credential').findOne({ type: 'gmail' })
    if (!credentials?.data) {
      return NextResponse.json(
        { error: 'Gmail not authenticated' },
        { status: 401 }
      )
    }

    // Set up Gmail API
    gmailService.setCredentials(credentials.data)
    const gmail = google.gmail({ version: 'v1', auth: gmailService.getAuth() })

    // Get the last processed historyId
    const watchSettings = await mongoose.model('Setting').findOne({ key: 'gmail_watch' })
    const lastHistoryId = watchSettings?.historyId

    // Get history of changes
    const history = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: lastHistoryId,
      historyTypes: ['messageAdded']
    })

    if (!history.data.history) {
      return NextResponse.json({ message: 'No new messages' })
    }

    // Process each new message
    for (const record of history.data.history) {
      for (const message of record.messagesAdded || []) {
        if (!message.message?.id) continue

        // Get the full message
        const email = await gmail.users.messages.get({
          userId: 'me',
          id: message.message.id,
          format: 'full'
        })

        const headers = email.data.payload?.headers
        const from = headers?.find(h => h.name?.toLowerCase() === 'from')?.value
        const subject = headers?.find(h => h.name?.toLowerCase() === 'subject')?.value

        // Check if this email matches our criteria
        // You can customize this based on your needs
        if (from?.includes('geofferyv@gmail.com') && subject?.includes('Invoice')) {
          // Process the email
          // Add your custom processing logic here
          console.log('Processing matching email:', { from, subject })
        }
      }
    }

    // Update the last processed historyId
    if (history.data.historyId) {
      await mongoose.model('Setting').updateOne(
        { key: 'gmail_watch' },
        { 
          $set: { 
            historyId: history.data.historyId,
            updatedAt: new Date().toISOString()
          }
        },
        { upsert: true }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing Gmail notification:', error)
    return NextResponse.json(
      { error: 'Failed to process Gmail notification' },
      { status: 500 }
    )
  }
} 