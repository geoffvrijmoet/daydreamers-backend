import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { google } from 'googleapis'
import { GmailService } from '@/lib/gmail'
import { JSDOM } from 'jsdom'
import { gmail_v1 } from 'googleapis'

const gmailService = new GmailService()

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const skip = parseInt(searchParams.get('skip') || '0')

    await connectToDatabase()

    // First get the transaction to get its emailId
    const transaction = await mongoose.model('Transaction').findOne({
      id: params.id,
      source: 'gmail'
    })

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    // Get Gmail credentials
    const credentials = await mongoose.model('Credential').findOne({ type: 'gmail' })
    if (!credentials?.data) {
      return NextResponse.json(
        { error: 'Gmail not authenticated' },
        { status: 401 }
      )
    }

    // Set up Gmail API
    gmailService.setCredentials(credentials.data)
    const gmail = google.gmail({ version: 'v1', auth: gmailService.getAuth() })

    // First get the AMEX email to extract the supplier name
    const amexEmail = await gmail.users.messages.get({
      userId: 'me',
      id: transaction.emailId,
      format: 'full'
    })

    // Get the email body
    const amexBody = amexEmail.data.payload?.parts?.[0]?.body?.data || amexEmail.data.payload?.body?.data
    if (!amexBody) {
      return NextResponse.json(
        { error: 'No email body found' },
        { status: 404 }
      )
    }

    const decodedAmexBody = Buffer.from(amexBody, 'base64').toString('utf-8')

    // Look for the supplier name in the specific HTML structure
    const supplierMatch = decodedAmexBody.match(/<div[^>]*color:#006fcf[^>]*>[^<]*<p[^>]*>([^<]+)<\/p>/i)
    const supplierName = supplierMatch ? supplierMatch[1].trim() : null

    if (!supplierName) {
      return NextResponse.json(
        { error: 'Could not find supplier name in email' },
        { status: 404 }
      )
    }

    // Find the supplier in our database
    const supplier = await mongoose.model('Supplier').findOne({
      $or: [
        { name: supplierName },
        { aliases: supplierName }
      ]
    })

    if (!supplier) {
      return NextResponse.json({
        emailBody: decodedAmexBody,
        extractedSupplier: supplierName,
        error: 'Supplier not found in database'
      })
    }

    // Now search for the supplier's invoice email
    const amount = transaction.amount
    // Format amount for search: e.g., $311.60 could appear as "311.60" or "311" or "$311.60"
    const amountInteger = Math.floor(amount)
    const amountWithDecimals = amount.toFixed(2)
    const query = `from:${supplier.invoiceEmail} subject:"${supplier.invoiceSubjectPattern.replace(/\(\\\d\+\)/g, '')}" (${amountWithDecimals} OR ${amountInteger} OR $${amountWithDecimals} OR $${amountInteger})`
    console.log('Searching for emails with query:', query)
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100  // Increased from 20 to 100 to get more results
    })

    if (!response.data.messages?.length) {
      return NextResponse.json({
        emailBody: decodedAmexBody,
        extractedSupplier: supplier.name,
        error: 'No emails found from this supplier'
      })
    }

    // Create a regex pattern from the supplier's subject pattern
    const subjectPattern = new RegExp(supplier.invoiceSubjectPattern, 'i')
    console.log('Using regex pattern:', subjectPattern)

    // Find the first email that matches the subject pattern
    let matchingEmail: gmail_v1.Schema$Message | null = null
    let skipped = 0
    
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
        if (skipped < skip) {
          skipped++
          continue
        }
        console.log('Found matching email with subject:', subject)
        matchingEmail = email.data
        break
      }
    }

    if (!matchingEmail) {
      return NextResponse.json({
        emailBody: decodedAmexBody,
        extractedSupplier: supplier.name,
        error: 'No more matching invoice emails found from this supplier',
        isLastEmail: true
      })
    }

    // Get the full content of the matching email
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
      return NextResponse.json({
        emailBody: decodedAmexBody,
        extractedSupplier: supplier.name,
        error: 'No email body found in invoice email'
      })
    }

    // Decode the base64 email body
    const decodedBody = Buffer.from(body, 'base64').toString('utf-8')

    // Parse products if pattern exists
    let parsedData = null
    if (supplier.emailParsing) {
      // Parse order number if pattern exists
      let orderNumber = null
      if (supplier.emailParsing.orderNumber) {
        const { pattern, flags = '', groupIndex = 1 } = supplier.emailParsing.orderNumber
        const orderMatch = decodedBody.match(new RegExp(pattern, flags))
        if (orderMatch && orderMatch[groupIndex]) {
          orderNumber = orderMatch[groupIndex]
        }
      }

      // Parse products if pattern exists
      const products: Array<{
        name: string
        quantity: number
        unitPrice: number
        totalPrice: number
      }> = []

      if (supplier.emailParsing.products) {
        const { 
          containerSelector, 
          nameSelector, 
          quantityPattern,
          quantityFlags = '',
          quantityGroupIndex = 2,
          priceSelector 
        } = supplier.emailParsing.products

        // Use jsdom to parse the HTML
        const dom = new JSDOM(decodedBody)
        const document = dom.window.document
        
        // Find all product containers
        const containers = document.querySelectorAll(containerSelector)
        console.log(`Found ${containers.length} product containers using selector: ${containerSelector}`)
        
        containers.forEach((container: Element) => {
          const nameEl = container.querySelector(nameSelector)
          const priceEl = container.querySelector(priceSelector)
          
          if (nameEl && priceEl) {
            const name = nameEl.textContent
            console.log('\nFound product in email:')
            console.log('Raw name:', name)
            
            if (name) {
              // Extract quantity from the name using the pattern
              const quantityMatch = name.match(new RegExp(quantityPattern, quantityFlags))
              const quantity = quantityMatch ? parseInt(quantityMatch[quantityGroupIndex]) : 1
              
              // Get clean name by removing the " x N" pattern, not the whole name
              const cleanName = name.replace(/ x \d+$/, '').trim()
              console.log('Parsed data:')
              console.log('- Clean name:', cleanName)
              console.log('- Quantity:', quantity)
              
              products.push({
                name: cleanName,
                quantity,
                unitPrice: 0, // We'll use the database price instead
                totalPrice: 0 // We'll use the database price instead
              })
            }
          }
        })
        
        console.log('\nTotal products found:', products.length)
        console.log('Final parsed products:', JSON.stringify(products, null, 2))

        parsedData = {
          orderNumber,
          products
        }
      }
    }

    return NextResponse.json({ 
      emailBody: decodedBody,
      extractedSupplier: supplier.name,
      parsedData,
      isLastEmail: skipped + 1 >= response.data.messages.length
    })

  } catch (error) {
    console.error('Error fetching email:', error)
    return NextResponse.json(
      { error: 'Failed to fetch email details' },
      { status: 500 }
    )
  }
} 