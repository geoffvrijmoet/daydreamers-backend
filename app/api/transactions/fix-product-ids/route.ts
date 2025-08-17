import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import TransactionModel from '@/lib/models/transaction'

export async function POST() {
  try {
    await connectToDatabase()
    console.log('Starting productId conversion...')

    // Find all transactions with string productIds
    const transactions = await TransactionModel.find({
      'products.productId': { $type: 'string' }
    }).lean()

    console.log(`Found ${transactions.length} transactions with string productIds`)

    let processedCount = 0
    let errorCount = 0
    let skippedCount = 0

    for (const transaction of transactions) {
      try {
        const transactionId = transaction._id.toString()
        const tx = transaction as Record<string, unknown>
        
        // Debug: Let's see what we're actually working with
        console.log(`Transaction ${transactionId} has ${(tx.products as Record<string, unknown>[])?.length || 0} products`)
        if (tx.products && Array.isArray(tx.products)) {
          (tx.products as Record<string, unknown>[]).forEach((item: Record<string, unknown>, index: number) => {
            console.log(`  Product ${index}:`, {
              productId: item?.productId,
              productIdType: typeof item?.productId,
              productIdConstructor: item?.productId?.constructor?.name
            })
          })
        }

        // Check if this transaction actually needs conversion
        let needsConversion = false
        if (tx.products && Array.isArray(tx.products)) {
          for (const productItem of tx.products) {
            if (productItem && productItem.productId && typeof productItem.productId === 'string') {
              needsConversion = true
              break
            }
          }
        }

        if (!needsConversion) {
          console.log(`Skipping transaction ${transactionId} - no string productIds found`)
          skippedCount++
          continue
        }

        // Use MongoDB's native driver to force ObjectId conversion
        if (tx.products && Array.isArray(tx.products)) {
          const { Types } = await import('mongoose')
          const updatedProducts = (tx.products as Record<string, unknown>[]).map((productItem: Record<string, unknown>) => {
            if (productItem && productItem.productId && typeof productItem.productId === 'string') {
              try {
                console.log(`Converting ${productItem.productId} to ObjectId in transaction ${transactionId}`)
                return {
                  ...productItem,
                  productId: new Types.ObjectId(productItem.productId)
                }
              } catch {
                console.log(`Invalid ObjectId format for productId: ${productItem.productId} in transaction ${transactionId}`)
                return productItem
              }
            }
            return productItem
          })
          
          // Use replaceOne to completely replace the document
          const result = await TransactionModel.replaceOne(
            { _id: transaction._id },
            { ...tx, products: updatedProducts }
          )
          console.log(`Replace result for ${transactionId}:`, result)
        }

        console.log(`Converted productIds in transaction ${transactionId}`)
        processedCount++

      } catch (error) {
        console.error(`Error processing transaction ${transaction._id}:`, error)
        errorCount++
      }
    }

    const result = {
      message: 'ProductId conversion completed',
      stats: {
        totalTransactions: transactions.length,
        processed: processedCount,
        skipped: skippedCount,
        errors: errorCount
      }
    }

    console.log('=== CONVERSION SUMMARY ===')
    console.log(`Total transactions found: ${transactions.length}`)
    console.log(`Successfully converted: ${processedCount}`)
    console.log(`Skipped: ${skippedCount}`)
    console.log(`Errors: ${errorCount}`)
    console.log('==========================')
    
    return NextResponse.json(result)

  } catch (error) {
    console.error('Conversion error:', error)
    return NextResponse.json(
      { error: 'Failed to run conversion' },
      { status: 500 }
    )
  }
}
