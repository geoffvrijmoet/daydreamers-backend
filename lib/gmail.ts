import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { EmailTransaction, GmailCredentials } from '@/types'
import { gmail_v1 } from 'googleapis/build/src/apis/gmail/v1'

const GMAIL_CREDENTIALS = {
  client_id: process.env.GMAIL_CLIENT_ID,
  client_secret: process.env.GMAIL_CLIENT_SECRET,
  redirect_uri: process.env.GMAIL_REDIRECT_URI
}

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

  async fetchAmexEmails(since: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client })
    
    try {
      const query = 'from:AmericanExpress@welcome.americanexpress.com'
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50
      })

      if (!response.data.messages) {
        return []
      }

      const transactions: EmailTransaction[] = []
      
      for (const message of response.data.messages) {
        try {
          const email = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'full'
          })

          const headers = email.data.payload?.headers
          const subject = headers?.find(h => h.name.toLowerCase() === 'subject')?.value

          if (!subject?.includes("Large Purchase Approved")) {
            continue
          }

          const body = email.data.payload?.parts?.[0]?.body?.data || email.data.payload?.body?.data
          if (!body) {
            continue
          }

          const decodedBody = Buffer.from(body, 'base64').toString('utf-8')
          const amountMatch = decodedBody.match(/\$(\d+,?\d*\.\d{2})\*/i)
          
          if (!amountMatch) {
            continue
          }

          const amount = Number(amountMatch[1].replace(',', ''));

          transactions.push({
            id: `${message.id!}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            date: email.data.internalDate 
              ? new Date(parseInt(email.data.internalDate)).toISOString()
              : new Date().toISOString(),
            amount: amount,
            description: `Charge for $${amount.toFixed(2)}`,
            merchant: '',
            cardLast4: '****',
            emailId: message.id!,
            source: 'gmail',
            type: 'purchase'
          })

        } catch (error) {
          continue
        }
      }

      return transactions

    } catch (error) {
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

  public getAuth(): OAuth2Client {
    return this.oauth2Client;
  }
}

export const gmailService = new GmailService() 