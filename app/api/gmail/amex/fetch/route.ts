import { NextResponse } from 'next/server'
import { gmailService } from '@/lib/gmail'
import { getDb } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const db = await getDb()
    const credentials = await db.collection('credentials').findOne({ type: 'gmail' })
    
    if (!credentials?.data) {
      throw new Error('Gmail not authenticated')
    }

    // First, get all existing Gmail transaction emailIds from MongoDB
    const existingTransactions = await db.collection('transactions')
      .find({ source: 'gmail' })
      .project({ emailId: 1 })
      .toArray()
    
    const existingEmailIds = new Set(existingTransactions.map(t => t.emailId))

    // Fetch new transactions from Gmail
    gmailService.setCredentials(credentials.data)
    const allTransactions = await gmailService.fetchAmexEmails()

    // Filter out transactions that already exist in MongoDB
    const newTransactions = allTransactions.filter(
      transaction => !existingEmailIds.has(transaction.emailId)
    )

    return NextResponse.json({ transactions: newTransactions })
  } catch (error) {
    console.error('Error fetching Amex emails:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
} 