import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import { gmailService } from '@/lib/gmail'
import CredentialModel from '@/lib/models/Credential'
import InvoiceEmailModel from '@/lib/models/InvoiceEmail'
import SupplierModel from '@/lib/models/Supplier'
import SyncStateModel from '@/lib/models/SyncState'
import TransactionModel from '@/lib/models/transaction'
import { google } from 'googleapis'
import { gmail_v1 } from 'googleapis'

type GmailService = gmail_v1.Gmail

// Helper function to parse email body
async function parseEmail(emailId: string, gmail: GmailService) {
  try {
    const email = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full'
    })

    const headers = email.data.payload?.headers
    const subject = headers?.find(h => h.name?.toLowerCase() === 'subject')?.value
    const from = headers?.find(h => h.name?.toLowerCase() === 'from')?.value
    const body = email.data.payload?.parts?.[0]?.body?.data || email.data.payload?.body?.data
    
    if (!body) {
      console.log(`No body found for email ${emailId}`)
      return null
    }

    const decodedBody = Buffer.from(body, 'base64').toString('utf-8')

    return {
      emailId,
      date: email.data.internalDate 
        ? new Date(parseInt(email.data.internalDate))
        : new Date(),
      subject: subject || 'No Subject',
      from: from || 'No Sender',
      body: decodedBody
    }
  } catch (error) {
    console.error(`Error parsing email ${emailId}:`, error)
    return null
  }
}

// Helper function to parse Amex email body
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
    
    // Extract purchase amount
    const amountMatch = decodedBody.match(/\$(\d+,?\d*\.\d{2})\*/i)
    let amount = 0
    
    if (amountMatch) {
      const amountStr = amountMatch[1].replace(',', '')
      amount = parseFloat(amountStr)
    }

    // Extract merchant name from the email's HTML structure
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
    console.error(`Error parsing Amex email ${emailId}:`, error)
    return null
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    console.log('Starting cron job execution...')
    
    // Get sinceDays parameter from URL
    const url = new URL(request.url)
    const sinceDays = url.searchParams.get('sinceDays')
    
    // Verify the request is coming from Vercel Cron OR allow manual triggers
    const authHeader = request.headers.get('authorization')
    const isCronRequest = authHeader && authHeader === `Bearer ${process.env.CRON_SECRET}`
    const isManualRequest = !authHeader // Allow manual requests without auth header
    
    if (!isCronRequest && !isManualRequest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize Gmail service
    await gmailService.initialize()
    await connectToDatabase()

    console.log('Starting cron job execution...')

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

    // Process supplier invoice emails
    const supplierResults = await processSupplierEmails(gmail, sinceDays)
    
    // Process Amex emails
    const amexResults = await processAmexEmails(gmail, sinceDays)

    // Combine results
    const totalEmailsProcessed = supplierResults.emailsProcessed + amexResults.transactionsProcessed

    return NextResponse.json({
      success: true,
      emailsProcessed: totalEmailsProcessed,
      supplierEmails: supplierResults.emails,
      amexTransactions: amexResults.transactions,
      summary: {
        supplierEmailsProcessed: supplierResults.emailsProcessed,
        amexTransactionsProcessed: amexResults.transactionsProcessed
      }
    })

  } catch (error) {
    console.error('Error checking emails:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check emails' },
      { status: 500 }
    )
  }
}

// Helper function to process supplier invoice emails
async function processSupplierEmails(gmail: GmailService, sinceDays: string | null) {
  console.log('Processing supplier invoice emails...')
  
  // Get suppliers with invoice email configuration
  const suppliers = await SupplierModel.find({
    invoiceEmail: { $exists: true, $ne: '' },
    invoiceSubjectPattern: { $exists: true, $ne: '' }
  })

  if (!suppliers.length) {
    console.log('No suppliers configured for invoice email checking')
    return { emailsProcessed: 0, emails: [] }
  }

  // Use sinceDays parameter to override sync state when provided
  let afterTimestamp: number
  if (sinceDays) {
    // Manual timeframe selection - always look back exactly the specified number of days
    const daysToLookBack = parseInt(sinceDays)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysToLookBack)
    afterTimestamp = Math.floor(startDate.getTime() / 1000)
    console.log(`Manual timeframe: Looking back ${daysToLookBack} days from ${startDate.toISOString()}`)
  } else {
    // Automatic sync - use last sync time or default to 7 days
    const syncState = await SyncStateModel.findOne({ source: 'gmail' })
    const daysToLookBack = 7
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysToLookBack)
    const lastSyncTime = syncState?.lastSuccessfulSync || startDate.toISOString()
    afterTimestamp = Math.floor(new Date(lastSyncTime).getTime() / 1000)
    console.log(`Automatic sync: Using last sync time or default ${daysToLookBack} days`)
  }
  
  // Process each supplier's emails
  const allProcessedEmails = []
  let totalEmailsProcessed = 0

  for (const supplier of suppliers) {
    console.log(`Processing emails for supplier: ${supplier.name}`)
    
    // Build the Gmail search query with subject pattern
    const query = `from:${supplier.invoiceEmail} subject:${supplier.invoiceSubjectPattern} after:${afterTimestamp}`
    console.log('Searching for invoices with query:', query)
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100
    })

    if (!response.data.messages) {
      console.log(`No new matching emails found for ${supplier.name}`)
      continue
    }

    // Process each matching email
    for (const message of response.data.messages) {
      if (!message.id) continue
      
      // Check if we've already processed this email
      const existingEmail = await InvoiceEmailModel.findOne({ emailId: message.id })

      if (existingEmail) {
        console.log(`Email ${message.id} already processed, skipping`)
        continue
      }
      
      const parsedEmail = await parseEmail(message.id, gmail)
      if (parsedEmail) {
        // Create a new invoice email record
        const invoiceEmail = new InvoiceEmailModel({
          ...parsedEmail,
          status: 'pending',
          supplierId: supplier._id
        })

        await invoiceEmail.save()
        allProcessedEmails.push({
          ...parsedEmail,
          _id: invoiceEmail._id
        })
        totalEmailsProcessed++
      }
    }
  }

  // Update sync state for supplier emails
  const now = new Date().toISOString()
  await SyncStateModel.findOneAndUpdate(
    { source: 'gmail' },
    { 
      $set: { 
        lastSuccessfulSync: now,
        lastSyncStatus: 'success',
        lastSyncResults: {
          created: totalEmailsProcessed,
          updated: 0,
          skipped: 0
        },
        updatedAt: now
      }
    },
    { upsert: true, new: true }
  )

  return { emailsProcessed: totalEmailsProcessed, emails: allProcessedEmails }
}

// Helper function to process Amex emails
async function processAmexEmails(gmail: GmailService, sinceDays: string | null) {
  console.log('Processing Amex emails...')
  
  // Use sinceDays parameter to override sync state when provided
  let afterTimestamp: number
  if (sinceDays) {
    // Manual timeframe selection - always look back exactly the specified number of days
    const daysToLookBack = parseInt(sinceDays)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysToLookBack)
    afterTimestamp = Math.floor(startDate.getTime() / 1000)
    console.log(`Manual timeframe: Looking back ${daysToLookBack} days from ${startDate.toISOString()}`)
  } else {
    // Automatic sync - use last sync time or default to 7 days
    const amexSyncState = await SyncStateModel.findOne({ source: 'gmail-amex' })
    const daysToLookBack = 7
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysToLookBack)
    const lastSyncTime = amexSyncState?.lastSuccessfulSync || startDate.toISOString()
    afterTimestamp = Math.floor(new Date(lastSyncTime).getTime() / 1000)
    console.log(`Automatic sync: Using last sync time or default ${daysToLookBack} days`)
  }
  
  // Build the Gmail search query for Amex emails
  const query = `from:AmericanExpress@welcome.americanexpress.com subject:"Large Purchase Approved" after:${afterTimestamp}`
  console.log('Searching for Amex emails with query:', query)
    
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 50
  })

  if (!response.data.messages || response.data.messages.length === 0) {
    console.log('No new matching Amex emails found')
    return { transactionsProcessed: 0, transactions: [] }
  }

  console.log(`Found ${response.data.messages.length} matching Amex emails`)
  
  // Process each matching email
  const processedTransactions = []
  let totalTransactionsProcessed = 0
  
  for (const message of response.data.messages) {
    if (!message.id) continue
    
    // Check if we've already processed this email
    const existingTransaction = await TransactionModel.findOne({ 
      emailId: message.id,
    })

    if (existingTransaction) {
      console.log(`Amex email ${message.id} already processed, skipping`)
      continue
    }
    
    const parsedEmail = await parseAmexEmail(message.id, gmail)
    if (parsedEmail) {
      // Create a new draft expense transaction
      const transaction = new TransactionModel({
        date: parsedEmail.date,
        amount: parsedEmail.amount,
        type: 'expense',
        source: 'amex',
        supplier: parsedEmail.merchant,
        notes: `Amex purchase - ${parsedEmail.subject} (Card ending in ${parsedEmail.cardLast4})`,
        emailId: parsedEmail.emailId,
        draft: true
      })

      await transaction.save()
      processedTransactions.push({
        ...parsedEmail,
        _id: transaction._id
      })
      totalTransactionsProcessed++
    }
  }

  // Update sync state for Amex emails
  const now = new Date().toISOString()
  await SyncStateModel.findOneAndUpdate(
    { source: 'gmail-amex' },
    { 
      $set: { 
        lastSuccessfulSync: now,
        lastSyncStatus: 'success',
        lastSyncResults: {
          created: totalTransactionsProcessed,
          updated: 0,
          skipped: 0
        },
        updatedAt: now
      }
    },
    { upsert: true, new: true }
  )

  return { transactionsProcessed: totalTransactionsProcessed, transactions: processedTransactions }
} 