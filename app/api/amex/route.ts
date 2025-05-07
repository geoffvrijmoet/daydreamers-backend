import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import { gmailService } from '@/lib/gmail'
import CredentialModel from '@/lib/models/Credential'
import { google } from 'googleapis'
import { gmail_v1 } from 'googleapis'

type GmailService = gmail_v1.Gmail

// Helper function to parse email body
async function parseAmexEmail(emailId: string, gmail: GmailService) {
  try {
    const email = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full'
    })

    const headers = email.data.payload?.headers
    const subject = headers?.find(h => h.name?.toLowerCase() === 'subject')?.value
    const from = headers?.find(h => h.name?.toLowerCase() === 'from')?.value
    const date = email.data.internalDate 
      ? new Date(parseInt(email.data.internalDate))
      : new Date()
    
    // Check if this is the specific type of email we're looking for
    if (!from?.includes('AmericanExpress@welcome.americanexpress.com') || 
        !subject?.includes('Large Purchase Approved')) {
      return null
    }

    const body = email.data.payload?.parts?.[0]?.body?.data || email.data.payload?.body?.data
    
    if (!body) {
      console.log(`No body found for email ${emailId}`)
      return null
    }

    const decodedBody = Buffer.from(body, 'base64').toString('utf-8')
    
    // Debug logging
    console.log('Decoded email body:', decodedBody)
    
    // Extract purchase amount
    const amountMatch = decodedBody.match(/\$(\d+,?\d*\.\d{2})\*/i)
    let amount = 0
    
    if (amountMatch) {
      const amountStr = amountMatch[1].replace(',', '')
      amount = parseFloat(amountStr)
      console.log('Found amount:', amount)
    }

    // Extract merchant name from the email's HTML structure
    // The merchant name appears in a div with color:#006fcf (Amex blue)
    const merchantPattern = /<div[^>]*style="[^"]*color:#006fcf[^"]*"[^>]*>[\s\n]*<p[^>]*>[\s\n]*([A-Z][A-Z0-9\s]+)[\s\n]*<\/p>/i
    const merchantMatch = decodedBody.match(merchantPattern)
    const merchant = merchantMatch ? merchantMatch[1].trim() : 'Unknown Merchant'

    // Extract card last 4 digits if possible
    const cardMatch = decodedBody.match(/card ending in (\d{4})/i)
    const cardLast4 = cardMatch ? cardMatch[1] : '****'

    return {
      emailId,
      date,
      subject: subject || 'No Subject',
      from: from || 'No Sender',
      body: decodedBody,
      amount,
      merchant,
      cardLast4
    }
  } catch (error) {
    console.error(`Error parsing email ${emailId}:`, error)
    return null
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    console.log('Starting Amex email search...')
    
    // Initialize Gmail service
    await gmailService.initialize()
    await connectToDatabase()

    // Get Gmail credentials
    const credentials = await CredentialModel.findOne({ type: 'gmail' })
    if (!credentials?.data) {
      console.log('No Gmail credentials found in database')
      return NextResponse.json(
        { error: 'Gmail not authenticated' },
        { status: 401 }
      )
    }

    console.log('Found Gmail credentials, setting up service...')
    
    // Set up Gmail API
    gmailService.setCredentials(credentials.data)
    const gmail = google.gmail({ version: 'v1', auth: gmailService.getAuth() })

    // Parse query parameters for optional date filtering
    const { searchParams } = new URL(request.url)
    const sinceDaysStr = searchParams.get('sinceDays')
    const sinceDays = sinceDaysStr ? parseInt(sinceDaysStr, 10) : 30 // Default to 30 days
    
    // Calculate after timestamp
    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - sinceDays)
    const afterTimestamp = Math.floor(sinceDate.getTime() / 1000)
    
    // Build the Gmail search query
    const query = `from:AmericanExpress@welcome.americanexpress.com subject:"Large Purchase Approved" after:${afterTimestamp}`
    console.log('Searching for Amex emails with query:', query)
      
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50
    })

    if (!response.data.messages || response.data.messages.length === 0) {
      console.log('No matching Amex emails found')
      return NextResponse.json({ 
        success: true, 
        emailsFound: 0, 
        transactions: [] 
      })
    }

    console.log(`Found ${response.data.messages.length} matching Amex emails`)
    
    // Process each matching email
    const processedTransactions = []
    
    for (const message of response.data.messages) {
      if (!message.id) continue
      
      const parsedEmail = await parseAmexEmail(message.id, gmail)
      if (parsedEmail) {
        processedTransactions.push(parsedEmail)
      }
    }

    return NextResponse.json({
      success: true,
      emailsFound: response.data.messages.length,
      transactionsProcessed: processedTransactions.length,
      transactions: processedTransactions
    })

  } catch (error) {
    console.error('Error processing Amex emails:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process Amex emails' },
      { status: 500 }
    )
  }
} 