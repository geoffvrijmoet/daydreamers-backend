import { NextResponse } from 'next/server'
import { gmailService } from '@/lib/gmail'
import { connectToDatabase } from '@/lib/mongoose'
import CredentialModel from '@/lib/models/Credential'
import { google } from 'googleapis'

export async function GET() {
  try {
    console.log('Starting Gmail API test...')
    
    // Initialize Gmail service
    await gmailService.initialize()
    await connectToDatabase()

    // Get Gmail credentials
    const credentials = await CredentialModel.findOne({ type: 'gmail' })
    if (!credentials?.data) {
      return NextResponse.json(
        { error: 'Gmail not authenticated' },
        { status: 401 }
      )
    }

    console.log('Found Gmail credentials, setting up service...')
    
    // Set up Gmail API
    gmailService.setCredentials(credentials.data)
    const gmail = google.gmail({ version: 'v1', auth: gmailService.getAuth() })

    // Test Gmail API access
    const profile = await gmail.users.getProfile({ userId: 'me' })
    console.log('Gmail API connection successful')
    
    // Try a basic search
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:geofferyv@gmail.com',
      maxResults: 1
    })

    return NextResponse.json({
      success: true,
      email: profile.data.emailAddress,
      messagesFound: response.data.messages ? response.data.messages.length : 0,
      response: response.data
    })
  } catch (error) {
    console.error('Gmail test error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gmail test failed' },
      { status: 500 }
    )
  }
} 