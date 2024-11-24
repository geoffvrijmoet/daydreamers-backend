import { NextResponse } from 'next/server'
import { gmailService } from '@/lib/gmail'

export async function GET() {
  try {
    console.log('Testing Gmail configuration...')
    console.log('Client ID:', process.env.GMAIL_CLIENT_ID ? 'Found' : 'Missing')
    console.log('Client Secret:', process.env.GMAIL_CLIENT_SECRET ? 'Found' : 'Missing')
    console.log('Redirect URI:', process.env.GMAIL_REDIRECT_URI)

    // Generate auth URL
    const authUrl = gmailService.getAuthUrl()
    console.log('Auth URL generated:', authUrl)

    return NextResponse.json({ 
      status: 'Configuration loaded',
      authUrl,
      clientId: process.env.GMAIL_CLIENT_ID ? 'Present' : 'Missing',
      redirectUri: process.env.GMAIL_REDIRECT_URI
    })
  } catch (error) {
    console.error('Gmail test error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gmail test failed' },
      { status: 500 }
    )
  }
} 