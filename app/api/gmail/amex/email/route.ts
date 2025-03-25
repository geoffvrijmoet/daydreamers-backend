import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { google } from 'googleapis'
import { GmailService } from '@/lib/gmail'
import { JSDOM } from 'jsdom'
import { gmail_v1 } from 'googleapis'

const gmailService = new GmailService()

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const emailId = searchParams.get('emailId')
    const skip = parseInt(searchParams.get('skip') || '0')

    if (!emailId) {
      return NextResponse.json(
        { error: 'Email ID is required' },
        { status: 400 }
      )
    }

    await connectToDatabase()

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
      id: emailId,
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

    // Extract amount from email
    const amountMatch = decodedAmexBody.match(/\$(\d+,?\d*\.\d{2})\*/i)
    const amount = amountMatch ? Number(amountMatch[1].replace(',', '')) : null

    // Now search for the supplier's invoice email
    // First try a broader search without subject or amount to see if we get any results
    const query = `from:${supplier.invoiceEmail}`;
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
    console.log('Amount to match:', amount)

    // Find the first email that matches both subject pattern and amount
    let matchingEmail: gmail_v1.Schema$Message | null = null
    let skipped = 0
    
    for (const message of response.data.messages) {
      const email = await gmail.users.messages.get({
        userId: 'me',
        id: message.id!,
        format: 'full'
      })

      const subject = email.data.payload?.headers?.find(
        h => h.name?.toLowerCase() === 'subject'
      )?.value

      // Get the email body to check for amount
      const body = email.data.payload?.parts?.[0]?.body?.data || email.data.payload?.body?.data
      if (!body) continue;

      const decodedEmailBody = Buffer.from(body, 'base64').toString('utf-8')
      
      // Look for amount in the email body
      const hasAmount = amount !== null && (
        decodedEmailBody.includes(`$${amount.toFixed(2)}`) ||
        decodedEmailBody.includes(`$${Math.floor(amount)}`) ||
        decodedEmailBody.includes(`${amount.toFixed(2)}`) ||
        decodedEmailBody.includes(`${Math.floor(amount)}`)
      )

      console.log('Checking email:', {
        subject,
        hasMatchingSubject: subject && subjectPattern.test(subject),
        hasMatchingAmount: hasAmount
      })

      if (subject && subjectPattern.test(subject) && hasAmount) {
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
          quantityGroupIndex = 2
        } = supplier.emailParsing.products

        // Use jsdom to parse the HTML
        const dom = new JSDOM(decodedBody)
        const document = dom.window.document
        
        // Find all product containers
        const containers = document.querySelectorAll(containerSelector)
        console.log(`Found ${containers.length} product containers using selector: ${containerSelector}`)
        
        containers.forEach((container: Element) => {
          const nameEl = container.querySelector(nameSelector)
          // Get the price from the last cell in the row that contains a price
          const priceEl = container.querySelector('.kl-table-subblock:last-of-type div span')
          
          if (nameEl && priceEl) {
            const name = nameEl.textContent
            console.log('\nFound product in email:')
            console.log('Raw name:', name)
            
            if (name) {
              // Extract quantity from the name using the pattern
              const quantityMatch = name.match(new RegExp(quantityPattern, quantityFlags))
              const quantity = quantityMatch ? parseInt(quantityMatch[quantityGroupIndex]) : 1
              
              // Get clean name by removing the " x N" pattern
              const cleanName = name.replace(/ x \d+$/, '').trim()
              console.log('Parsed data:')
              console.log('- Clean name:', cleanName)
              console.log('- Quantity:', quantity)

              // Extract price from the price element
              let unitPrice = 0
              let totalPrice = 0
              if (priceEl.textContent) {
                // Get the price text and try to extract the price
                const priceText = priceEl.textContent.trim()
                console.log('Raw price text:', priceText)

                // Try to extract the price using a regex that looks for $XX.XX format
                const priceMatch = priceText.match(/\$(\d+(?:\.\d{2})?)/);
                if (priceMatch) {
                  totalPrice = parseFloat(priceMatch[1])
                  unitPrice = totalPrice / quantity

                  // Apply 20% discount
                  unitPrice = unitPrice * 0.8
                  totalPrice = totalPrice * 0.8

                  // Double the quantity since email shows half quantities
                  const actualQuantity = quantity * 2

                  // Divide by 2 since prices are for 2lb increments
                  unitPrice = unitPrice / 2
                  
                  // Calculate total price based on actual quantity
                  totalPrice = (unitPrice * actualQuantity)

                  // Round to 2 decimal places
                  unitPrice = Math.round(unitPrice * 100) / 100
                  totalPrice = Math.round(totalPrice * 100) / 100

                  // Ensure we have valid numbers
                  if (isNaN(unitPrice) || isNaN(totalPrice)) {
                    unitPrice = 0
                    totalPrice = 0
                  }

                  console.log('Parsed price data:', {
                    rawPrice: priceText,
                    priceMatch: priceMatch[1],
                    quantity: actualQuantity,
                    unitPrice,
                    totalPrice,
                    note: 'Prices are per 1lb (divided by 2 from email prices which show 2lb increments)'
                  })
                } else {
                  console.log('Could not extract price from:', priceText)
                }
              }
              
              // Only add products that have valid prices and are not links
              if (unitPrice > 0 && totalPrice > 0 && !cleanName.toLowerCase().includes('click here')) {
                products.push({
                  name: cleanName,
                  quantity,
                  unitPrice,
                  totalPrice
                })
              }
            }
          }
        })

        console.log('\nTotal products found:', products.length)
        console.log('Final parsed products:', JSON.stringify(products, null, 2))

        // Deduplicate products by name before calculating total
        const uniqueProducts = Array.from(
          products.reduce((map, product) => {
            if (!map.has(product.name)) {
              map.set(product.name, product)
            }
            return map
          }, new Map()).values()
        )

        // Calculate total amount from unique products
        const totalAmount = Math.round(uniqueProducts.reduce((sum, product) => sum + product.totalPrice, 0) * 100) / 100
        console.log('Total amount:', totalAmount)

        parsedData = {
          orderNumber,
          products: uniqueProducts,
          totalAmount
        }
      }
    }

    return NextResponse.json({ 
      emailBody: decodedBody,
      extractedSupplier: supplier.name,
      parsedData,
      amount: parsedData?.totalAmount || 0,
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