import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import { gmailService } from '@/lib/gmail'
import CredentialModel from '@/lib/models/Credential'
import InvoiceEmailModel from '@/lib/models/InvoiceEmail'
import SupplierModel from '@/lib/models/Supplier'
import SyncStateModel from '@/lib/models/SyncState'
import { google } from 'googleapis'
import { gmail_v1 } from 'googleapis'

type GmailService = gmail_v1.Gmail

// Helper function to parse email body for invoice details
async function parseInvoiceEmail(emailId: string, gmail: GmailService) {
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
    
    // You can customize these patterns based on your email format
    const amountMatch = decodedBody.match(/\$(\d+,?\d*\.\d{2})/i)
    const invoiceNumberMatch = decodedBody.match(/Invoice[:#\s]+([A-Z0-9-]+)/i)
    
    if (!amountMatch) {
      console.log(`No amount found in email ${emailId}`)
      return null
    }

    return {
      emailId,
      date: email.data.internalDate 
        ? new Date(parseInt(email.data.internalDate))
        : new Date(),
      amount: parseFloat(amountMatch[1].replace(',', '')),
      invoiceNumber: invoiceNumberMatch?.[1] || undefined,
      subject: subject || 'No Subject',
      from: from || 'No Sender',
      body: decodedBody
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
    // Verify the request is coming from Vercel Cron
    const authHeader = request.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

    // Get suppliers with invoice email configuration
    const suppliers = await SupplierModel.find({
      invoiceEmail: { $exists: true, $ne: '' },
      invoiceSubjectPattern: { $exists: true, $ne: '' }
    })

    if (!suppliers.length) {
      console.log('No suppliers configured for invoice email checking')
      return NextResponse.json({ 
        success: true,
        emailsProcessed: 0,
        emails: [],
        message: 'No suppliers configured for invoice email checking'
      })
    }

    // Get last sync time from SyncState
    const syncState = await SyncStateModel.findOne({ source: 'gmail' })
    const now = new Date()
    
    // If no sync state exists, default to 7 days ago for initial sync
    const defaultSyncTime = new Date(now)
    defaultSyncTime.setDate(defaultSyncTime.getDate() - 7)
    
    const lastSyncTime = syncState?.lastSuccessfulSync || defaultSyncTime.toISOString()
    console.log(`Using ${syncState ? 'existing' : 'default'} sync time:`, lastSyncTime)

    // Process each supplier's emails
    const allProcessedEmails = []
    let totalEmailsProcessed = 0

    for (const supplier of suppliers) {
      console.log(`Processing emails for supplier: ${supplier.name}`)
      
      const query = `from:${supplier.invoiceEmail} subject:"${supplier.invoiceSubjectPattern}" after:${Math.floor(new Date(lastSyncTime).getTime() / 1000)}`
      console.log('Searching for invoices with query:', query)
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50
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
        
        const parsedEmail = await parseInvoiceEmail(message.id, gmail)
        if (parsedEmail) {
          // Create a new invoice email record
          const invoiceEmail = new InvoiceEmailModel({
            ...parsedEmail,
            supplier: supplier.name,
            status: 'pending'
          })

          await invoiceEmail.save()
          allProcessedEmails.push({
            ...parsedEmail,
            supplier: supplier.name,
            _id: invoiceEmail._id
          })
          totalEmailsProcessed++
        }
      }
    }

    // Update sync state
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
          }
        }
      },
      { upsert: true, new: true }
    )

    return NextResponse.json({
      success: true,
      emailsProcessed: totalEmailsProcessed,
      emails: allProcessedEmails
    })

  } catch (error) {
    console.error('Error checking emails:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check emails' },
      { status: 500 }
    )
  }
} 