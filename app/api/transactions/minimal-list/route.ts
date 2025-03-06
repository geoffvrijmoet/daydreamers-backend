import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

/**
 * Returns a minimal list of transactions (ID, source, amount) for client-side 
 * duplication checking during file uploads
 */
export async function GET() {
  try {
    const db = await getDb()
    
    // Get only the necessary fields for duplicate checking
    const transactions = await db.collection('transactions')
      .find({})
      .project({ 
        _id: 1, 
        id: 1, 
        source: 1, 
        date: 1, 
        amount: 1,
        excelId: 1, // Add excelId for Venmo, Cash App, and Cash checks
        type: 1, // Include type for expense checking
        supplier: 1, // Include supplier for expense checking
        supplierOrderNumber: 1, // Include supplierOrderNumber for expense checking
        paymentMethod: 1 // Include payment method for filtering by payment type
      })
      .toArray()
    
    console.log(`Returning ${transactions.length} transactions for duplication checking`)
    
    return NextResponse.json({
      transactions
    })
  } catch (error) {
    console.error('Error fetching minimal transaction list:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
} 