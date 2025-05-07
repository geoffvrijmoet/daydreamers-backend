import { connectToDatabase } from '../lib/mongoose.ts'
import { gmailService } from '../lib/gmail.ts'
import CredentialModel from '../lib/models/Credential.ts'
import { google } from 'googleapis'
import { gmail_v1 } from 'googleapis'
import fs from 'fs'
import path from 'path'

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
    
    // Extract purchase amount
    const amountMatch = decodedBody.match(/\$(\d+,?\d*\.\d{2})\*/i)
    let amount = 0
    
    if (amountMatch) {
      const amountStr = amountMatch[1].replace(',', '')
      amount = parseFloat(amountStr)
    }

    // Extract merchant name if possible (this regex might need adjustment)
    const merchantMatch = decodedBody.match(/was made at ([^\.]+)/i)
    const merchant = merchantMatch ? merchantMatch[1].trim() : 'Unknown Merchant'

    // Extract card last 4 digits if possible (this regex might need adjustment)
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

async function downloadAmexEmails() {
  try {
    console.log('Starting Amex email download...')
    
    // Initialize Gmail service
    await gmailService.initialize()
    await connectToDatabase()

    // Get Gmail credentials
    const credentials = await CredentialModel.findOne({ type: 'gmail' })
    if (!credentials?.data) {
      console.log('No Gmail credentials found in database')
      return
    }

    console.log('Found Gmail credentials, setting up service...')
    
    // Set up Gmail API
    gmailService.setCredentials(credentials.data)
    const gmail = google.gmail({ version: 'v1', auth: gmailService.getAuth() })

    // Parse command line arguments for optional date filtering
    const args = process.argv.slice(2)
    const sinceDaysArg = args.find(arg => arg.startsWith('--since='))
    const sinceDays = sinceDaysArg 
      ? parseInt(sinceDaysArg.split('=')[1], 10) 
      : 30 // Default to 30 days
    
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
      return
    }

    console.log(`Found ${response.data.messages.length} matching Amex emails`)
    
    // Create directory if it doesn't exist
    const outputDir = path.join(process.cwd(), 'data', 'amex-emails')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    
    // Process each matching email
    let downloadedCount = 0
    
    for (const message of response.data.messages) {
      if (!message.id) continue
      
      const parsedEmail = await parseAmexEmail(message.id, gmail)
      if (parsedEmail) {
        // Create a filename based on the email date and ID
        const dateStr = parsedEmail.date.toISOString().split('T')[0]
        const filename = `${dateStr}_${parsedEmail.emailId}.html`
        const filePath = path.join(outputDir, filename)
        
        // Save the email body to a file
        fs.writeFileSync(filePath, parsedEmail.body)
        console.log(`Saved email to ${filename}`)
        downloadedCount++
      }
    }

    console.log(`Successfully downloaded ${downloadedCount} Amex emails to ${outputDir}`)

  } catch (error) {
    console.error('Error downloading Amex emails:', error)
  }
}

// Run the script
downloadAmexEmails()
  .then(() => {
    console.log('Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Script failed:', error)
    process.exit(1)
  }) 