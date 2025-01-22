import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { ObjectId } from 'mongodb'
import { google } from 'googleapis'
import { GmailService } from '@/lib/gmail'
import { gmail_v1 } from 'googleapis'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getDb()
    const supplier = await db.collection('suppliers').findOne({
      _id: new ObjectId(params.id)
    })

    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }

    // Get Gmail credentials
    const credentials = await db.collection('credentials').findOne({ type: 'gmail' })
    if (!credentials?.data) {
      return NextResponse.json(
        { error: 'Gmail not authenticated' },
        { status: 401 }
      )
    }

    // Get Gmail service
    const gmailService = new GmailService()
    gmailService.setCredentials(credentials.data)
    const gmail = google.gmail({ version: 'v1', auth: gmailService.getAuth() })

    // Step 1: Do a broader search just using the supplier's email
    const query = `from:${supplier.invoiceEmail}`
    console.log('Searching for emails with query:', query)
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 20  // Get more results to filter through
    })

    if (!response.data.messages?.length) {
      return NextResponse.json(
        { error: 'No emails found from this supplier' },
        { status: 404 }
      )
    }

    // Step 2: Create a regex pattern from the supplier's subject pattern
    const subjectPattern = new RegExp(supplier.invoiceSubjectPattern, 'i')
    console.log('Using regex pattern:', subjectPattern)

    // Step 3: Find the first email that matches the subject pattern
    let matchingEmail: gmail_v1.Schema$Message | null = null
    
    for (const message of response.data.messages) {
      const email = await gmail.users.messages.get({
        userId: 'me',
        id: message.id!,
        format: 'metadata',
        metadataHeaders: ['subject']
      })

      const subject = email.data.payload?.headers?.find(
        h => h.name?.toLowerCase() === 'subject'
      )?.value

      if (subject && subjectPattern.test(subject)) {
        console.log('Found matching email with subject:', subject)
        matchingEmail = email.data
        break
      }
    }

    if (!matchingEmail) {
      return NextResponse.json(
        { error: 'No matching invoice emails found from this supplier' },
        { status: 404 }
      )
    }

    // Step 4: Get the full content of the matching email
    const fullEmail = await gmail.users.messages.get({
      userId: 'me',
      id: matchingEmail.id!,
      format: 'full'
    })

    // Get the email body
    const body = fullEmail.data.payload?.parts?.find(
      (part: gmail_v1.Schema$MessagePart) => part.mimeType === 'text/html'
    )?.body?.data || fullEmail.data.payload?.body?.data

    if (!body) {
      return NextResponse.json(
        { error: 'No email body found' },
        { status: 404 }
      )
    }

    // Decode the base64 email body
    const decodedBody = Buffer.from(body, 'base64').toString('utf-8')

    return NextResponse.json({ 
      emailBody: decodedBody,
      subject: fullEmail.data.payload?.headers?.find(
        h => h.name?.toLowerCase() === 'subject'
      )?.value
    })
  } catch (error) {
    console.error('Error fetching sample email:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sample email' },
      { status: 500 }
    )
  }
} 