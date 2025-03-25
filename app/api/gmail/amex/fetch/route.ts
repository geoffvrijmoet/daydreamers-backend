import { NextResponse } from 'next/server'
import { gmailService } from '@/lib/gmail'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

export async function GET() {
  try {
    await connectToDatabase()
    const credentials = await mongoose.model('Credential').findOne({ type: 'gmail' })
    
    if (!credentials?.data) {
      throw new Error('Gmail not authenticated')
    }

    // First, get all existing Gmail transaction emailIds from MongoDB
    const existingTransactions = await mongoose.model('Transaction')
      .find({ 
        source: 'gmail',
        type: 'purchase'
      })
      .select({ emailId: 1 })
    
    const existingEmailIds = new Set(existingTransactions.map((t) => (t as { emailId: string }).emailId))

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