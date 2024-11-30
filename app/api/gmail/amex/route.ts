import { NextResponse } from 'next/server'
import { gmailService } from '@/lib/gmail'
import { getDb } from '@/lib/db'

async function fetchAmexTransactions() {
  const db = await getDb()
  
  try {
    // Get Gmail credentials
    console.log('\n=== Checking Gmail Credentials ===')
    const credentials = await db.collection('credentials').findOne({ type: 'gmail' })
    
    if (!credentials?.data) {
      console.log('❌ No Gmail credentials found in database')
      throw new Error('Gmail not authenticated')
    }
    console.log('✓ Found Gmail credentials')
    console.log('Access token exists:', !!credentials.data.accessToken)
    console.log('Refresh token exists:', !!credentials.data.refreshToken)

    // Set credentials and verify Gmail access
    console.log('\n=== Setting Gmail Credentials ===')
    gmailService.setCredentials(credentials.data)
    console.log('✓ Credentials set')

    // Fetch emails and parse transactions
    console.log('\n=== Fetching Amex Emails ===')
    try {
      const transactions = await gmailService.fetchAmexEmails()
      console.log(`✓ Found ${transactions.length} transactions`)

      // Store new transactions in database
      if (transactions.length > 0) {
        console.log('\n=== Storing Transactions ===')
        const result = await db.collection('transactions').insertMany(
          transactions.map(t => ({
            ...t,
            createdAt: new Date().toISOString(),
            processed: false
          }))
        )
        console.log(`✓ Stored ${result.insertedCount} transactions`)
      }

      // Get all stored transactions
      console.log('\n=== Fetching All Stored Transactions ===')
      const allTransactions = await db.collection('transactions')
        .find({ source: 'gmail' })
        .sort({ date: -1 })
        .toArray()

      console.log(`✓ Retrieved ${allTransactions.length} total transactions`)
      return allTransactions

    } catch (error) {
      console.error('\n❌ Error in Gmail operations:', error)
      if (error instanceof Error) {
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        })
      }
      throw error
    }

  } catch (error) {
    console.error('\n❌ Error in fetchAmexTransactions:', error)
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
    }
    throw error
  }
}

export async function GET() {
  try {
    console.log('\n=== Starting GET /api/gmail/amex ===')
    const transactions = await fetchAmexTransactions()
    console.log('=== GET /api/gmail/amex Complete ===')
    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Error in GET /api/gmail/amex:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}

export async function POST() {
  try {
    console.log('\n=== Starting POST /api/gmail/amex ===')
    const transactions = await fetchAmexTransactions()
    console.log('=== POST /api/gmail/amex Complete ===')
    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Error in POST /api/gmail/amex:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync transactions' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 })
    }

    const db = await getDb()
    const result = await db.collection('transactions').deleteOne({ 
      id,
      source: 'gmail'
    })

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting transaction:', error)
    return NextResponse.json(
      { error: 'Failed to delete transaction' },
      { status: 500 }
    )
  }
} 