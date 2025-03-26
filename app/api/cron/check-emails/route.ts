import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import { gmailService } from '@/lib/gmail'
import CredentialModel from '@/lib/models/Credential'
import InvoiceEmailModel from '@/lib/models/InvoiceEmail'
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

    // Get Gmail credentials
    const credentials = await CredentialModel.findOne({ type: 'gmail' })
    if (!credentials?.data) {
      return NextResponse.json(
        { error: 'Gmail not authenticated' },
        { status: 401 }
      )
    }

    // Set up Gmail API
    gmailService.setCredentials(credentials.data)
    const gmail = google.gmail({ version: 'v1', auth: gmailService.getAuth() })

    // Calculate timestamp for 24 hours ago
    const oneDayAgo = new Date()
    oneDayAgo.setHours(oneDayAgo.getHours() - 24)
    
    // Search for matching emails from the past 24 hours
    const query = `from:geofferyv@gmail.com subject:Invoice after:${Math.floor(oneDayAgo.getTime() / 1000)}`
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50
    })

    if (!response.data.messages) {
      console.log('No new matching emails found')
      return NextResponse.json({ message: 'No new emails found' })
    }

    // Process each matching email
    const processedEmails = []
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
          status: 'pending'
        })

        await invoiceEmail.save()
        processedEmails.push({
          ...parsedEmail,
          _id: invoiceEmail._id
        })
      }
    }

    return NextResponse.json({
      success: true,
      emailsProcessed: processedEmails.length,
      emails: processedEmails
    })

  } catch (error) {
    console.error('Error checking emails:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check emails' },
      { status: 500 }
    )
  }
} 