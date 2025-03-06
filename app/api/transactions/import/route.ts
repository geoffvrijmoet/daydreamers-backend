import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function POST(request: Request) {
  try {
    const { transactions } = await request.json()
    
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ error: 'No transactions provided' }, { status: 400 })
    }
    
    const { db } = await connectToDatabase()
    const collection = db.collection('transactions')
    
    // Process transactions to insert
    let successCount = 0
    const results = []
    
    for (const transaction of transactions) {
      // Check if this transaction already exists
      let existingTransaction = null
      
      // For structured IDs (square_XXX, shopify_XXX)
      if (transaction.id) {
        existingTransaction = await collection.findOne({ id: transaction.id })
      }
      
      // If not found by ID and it's a manual transaction, try to find by date and amount
      if (!existingTransaction && transaction.source === 'manual') {
        const date = new Date(transaction.date)
        const startDate = new Date(date)
        startDate.setHours(0, 0, 0, 0)
        
        const endDate = new Date(date)
        endDate.setHours(23, 59, 59, 999)
        
        existingTransaction = await collection.findOne({
          source: 'manual',
          amount: transaction.amount,
          date: { 
            $gte: startDate.toISOString(),
            $lte: endDate.toISOString()
          }
        })
      }
      
      // For Venmo, Cash App, or Cash payment methods, check if excelId matches the transaction ID
      if (!existingTransaction && 
          transaction.paymentMethod && 
          ['venmo', 'cash app', 'cash'].some(method => 
            transaction.paymentMethod?.toLowerCase().includes(method))) {
        
        // If the transaction has an ID and excelId field might be set
        if (transaction.id) {
          existingTransaction = await collection.findOne({ excelId: transaction.id })
          
          if (existingTransaction) {
            console.log(`Found existing ${transaction.paymentMethod} transaction with excelId matching transaction ID: ${transaction.id}`)
          }
        }
      }
      
      if (existingTransaction) {
        // Skip this transaction as it already exists
        results.push({
          status: 'skipped',
          message: 'Transaction already exists',
          transaction
        })
      } else {
        // Insert new transaction
        const transactionToInsert = { ...transaction };

        // Remove the id field for Excel transactions as requested
        // We'll still keep the excelId field for tracking
        if (transactionToInsert.source === 'excel' && 'id' in transactionToInsert) {
          delete transactionToInsert.id;
          console.log('Removed id field from excel transaction, using excelId for tracking');
        }

        const insertResult = await collection.insertOne({
          ...transactionToInsert,
          _id: new ObjectId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        
        if (insertResult.acknowledged) {
          successCount++
          results.push({
            status: 'success',
            message: 'Transaction imported successfully',
            id: insertResult.insertedId
          })
        } else {
          results.push({
            status: 'error',
            message: 'Failed to insert transaction',
            transaction
          })
        }
      }
    }
    
    return NextResponse.json({
      imported: successCount,
      total: transactions.length,
      results
    })
  } catch (error) {
    console.error('Error importing transactions:', error)
    return NextResponse.json(
      { error: 'Failed to import transactions' },
      { status: 500 }
    )
  }
} 