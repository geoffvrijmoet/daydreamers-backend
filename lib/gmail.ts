import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { EmailTransaction, GmailCredentials } from '@/types'
import { GoogleAuth } from 'google-auth-library'

const GMAIL_CREDENTIALS = {
  client_id: process.env.GMAIL_CLIENT_ID,
  client_secret: process.env.GMAIL_CLIENT_SECRET,
  redirect_uri: process.env.GMAIL_REDIRECT_URI
}

export class GmailService {
  private oauth2Client: OAuth2Client
  private serviceAuth: GoogleAuth | null = null

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

  async initialize() {
    // Set up service account auth for Gmail operations
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}')
    this.serviceAuth = new GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.metadata'
      ]
    })
  }

  getAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      prompt: 'consent'
    })
  }

  async getTokens(code: string): Promise<GmailCredentials> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code)

      if (!tokens.access_token) {
        throw new Error('No access token received')
      }

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || '',
        expiryDate: tokens.expiry_date || Date.now() + 3600000
      }
    } catch (error) {
      throw error
    }
  }

  async fetchAmexEmails(since?: Date) {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client })
    
    try {
      const query = `from:AmericanExpress@welcome.americanexpress.com${since ? ` after:${Math.floor(since.getTime() / 1000)}` : ''}`
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50
      })

      if (!response.data.messages) {
        console.log('No messages found matching the query')
        return []
      }

      const transactions: EmailTransaction[] = []
      
      for (const message of response.data.messages) {
        try {
          if (!message.id) {
            console.log('Skipping message with no ID')
            continue
          }

          const email = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          })

          const headers = email.data.payload?.headers
          const subject = headers?.find(header => header.name?.toLowerCase() === 'subject')?.value

          if (!subject?.includes("Large Purchase Approved")) {
            console.log(`Skipping email with subject: ${subject}`)
            continue
          }

          const body = email.data.payload?.parts?.[0]?.body?.data || email.data.payload?.body?.data
          if (!body) {
            console.log(`No body found for email ${message.id}`)
            continue
          }

          const decodedBody = Buffer.from(body, 'base64').toString('utf-8')
          const amountMatch = decodedBody.match(/\$(\d+,?\d*\.\d{2})\*/i)
          
          if (!amountMatch) {
            console.log(`No amount found in email ${message.id}`)
            continue
          }

          const amountStr = amountMatch[1].replace(',', '')
          const parsedAmount = Number(amountStr)

          if (isNaN(parsedAmount)) {
            console.log(`Invalid amount format in email ${message.id}: ${amountStr}`)
            continue
          }

          const transaction: EmailTransaction = {
            id: `${message.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            date: email.data.internalDate 
              ? new Date(parseInt(email.data.internalDate)).toISOString()
              : new Date().toISOString(),
            amount: parsedAmount,
            description: `Charge for $${parsedAmount.toFixed(2)}`,
            merchant: '',
            cardLast4: '****',
            emailId: message.id,
            source: 'gmail',
            type: 'purchase'
          }

          transactions.push(transaction)
          console.log(`Successfully processed transaction from email ${message.id} for amount $${parsedAmount}`)

        } catch (error) {
          console.error(`Error processing email ${message.id}:`, error)
          continue
        }
      }

      console.log(`Successfully processed ${transactions.length} transactions`)
      return transactions

    } catch (error) {
      console.error('Error fetching Amex emails:', error)
      throw error
    }
  }

  public setCredentials(credentials: GmailCredentials) {
    this.oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      expiry_date: credentials.expiryDate
    })
  }

  public getAuth(): OAuth2Client {
    return this.oauth2Client;
  }

  async getMessage(messageId: string) {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client })
    
    return gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    })
  }
}

export const gmailService = new GmailService() 