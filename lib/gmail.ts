import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { EmailTransaction, GmailCredentials } from '@/types'
import { GaxiosResponse } from 'gaxios'
import { gmail_v1 } from 'googleapis/build/src/apis/gmail/v1'

const GMAIL_CREDENTIALS = {
  client_id: process.env.GMAIL_CLIENT_ID,
  client_secret: process.env.GMAIL_CLIENT_SECRET,
  redirect_uri: process.env.GMAIL_REDIRECT_URI
}

type GmailMessage = gmail_v1.Schema$Message

export class GmailService {
  private oauth2Client: OAuth2Client

  constructor() {
    if (!GMAIL_CREDENTIALS.client_id || !GMAIL_CREDENTIALS.client_secret || !GMAIL_CREDENTIALS.redirect_uri) {
      throw new Error('Missing Gmail credentials in environment variables')
    }

    this.oauth2Client = new google.auth.OAuth2(
      GMAIL_CREDENTIALS.client_id,
      GMAIL_CREDENTIALS.client_secret,
      GMAIL_CREDENTIALS.redirect_uri
    )
  }

  getAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      prompt: 'consent'  // Force consent screen to get refresh token
    })
  }

  async getTokens(code: string): Promise<GmailCredentials> {
    try {
      console.log('Getting tokens with code:', code)
      const { tokens } = await this.oauth2Client.getToken(code)
      console.log('Received tokens:', {
        access_token: tokens.access_token ? 'present' : 'missing',
        refresh_token: tokens.refresh_token ? 'present' : 'missing',
        expiry_date: tokens.expiry_date
      })

      if (!tokens.access_token) {
        throw new Error('No access token received')
      }

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || '',
        expiryDate: tokens.expiry_date || Date.now() + 3600000
      }
    } catch (error) {
      console.error('Error getting tokens:', error)
      throw error
    }
  }

  async fetchAmexEmails(since: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client })
    
    try {
      // Step 1: Verify Gmail API access
      console.log('\n=== Starting Gmail API Access Check ===')
      const profile = await gmail.users.getProfile({ userId: 'me' })
      console.log('✓ Gmail API access verified for:', profile.data.emailAddress)

      // Step 2: Search for Amex emails
      console.log('\n=== Searching for Amex Emails ===')
      const query = 'from:AmericanExpress@welcome.americanexpress.com'
      console.log('Using query:', query)
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50
      })

      if (!response.data.messages) {
        console.log('❌ No Amex emails found')
        return []
      }

      console.log(`✓ Found ${response.data.messages.length} Amex emails`)
      const transactions: EmailTransaction[] = []
      
      // Step 3: Process each email
      for (const message of response.data.messages) {
        try {
          console.log(`\nProcessing email ${message.id}...`)
          const email = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'full'
          })

          // Log email details
          const headers = email.data.payload?.headers
          const subject = headers?.find(h => h.name.toLowerCase() === 'subject')?.value
          const from = headers?.find(h => h.name.toLowerCase() === 'from')?.value
          const date = headers?.find(h => h.name.toLowerCase() === 'date')?.value

          console.log('Email details:', { subject, from, date })

          // Only process Large Transaction emails
          if (!subject?.includes('Large Transaction')) {
            console.log('Skipping - not a Large Transaction email')
            continue
          }

          // Get and decode email body
          const body = email.data.payload?.parts?.[0]?.body?.data || email.data.payload?.body?.data
          if (!body) {
            console.log('❌ No email body found')
            continue
          }

          const decodedBody = Buffer.from(body, 'base64').toString('utf-8')
          console.log('Email body preview:', decodedBody.substring(0, 200))

          // Parse transaction details
          const amountMatch = decodedBody.match(/\$(\d+,?\d*\.\d{2})\*/i)
          const merchantMatch = decodedBody.match(/([A-Z][A-Z\s&]+)(?=\s+\$\d+,?\d*\.\d{2}\*)/i)

          console.log('Regex matches:', {
            amount: amountMatch?.[1],
            merchant: merchantMatch?.[1]
          })

          if (!amountMatch || !merchantMatch) {
            console.log('❌ Required fields not found')
            continue
          }

          const transaction: EmailTransaction = {
            id: message.id!,
            date: email.data.internalDate 
              ? new Date(parseInt(email.data.internalDate)).toISOString()
              : new Date().toISOString(),
            amount: Number(amountMatch[1].replace(',', '')),
            description: `Charge at ${merchantMatch[1].trim()}`,
            merchant: merchantMatch[1].trim(),
            cardLast4: '****',
            emailId: message.id!,
            source: 'gmail',
            type: 'purchase'
          }

          console.log('✓ Successfully parsed transaction:', transaction)
          transactions.push(transaction)

        } catch (error) {
          console.error('❌ Error processing email:', message.id, error)
        }
      }

      console.log(`\n=== Processing Complete ===`)
      console.log(`Found ${transactions.length} valid transactions`)
      return transactions

    } catch (error) {
      console.error('\n❌ Gmail API Error:', error)
      throw error
    }
  }

  setCredentials(credentials: GmailCredentials) {
    this.oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      expiry_date: credentials.expiryDate
    })
  }
}

export const gmailService = new GmailService() 