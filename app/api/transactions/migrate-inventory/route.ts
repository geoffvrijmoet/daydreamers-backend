import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import TransactionModel from '@/lib/models/transaction'
import ProductModel from '@/lib/models/Product'
import type { Model } from 'mongoose'

// Lazy import to avoid module loading issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let InventoryChangeModel: Model<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getInventoryChangeModel(): Promise<Model<any> | null> {
  if (!InventoryChangeModel) {
    try {
      // Check if model is already registered
      const mongoose = await import('mongoose')
      if (mongoose.models.InventoryChange) {
        InventoryChangeModel = mongoose.models.InventoryChange
      } else {
        const { InventoryChangeModel: Model } = await import('@/lib/models/inventory-change')
        InventoryChangeModel = Model
      }
    } catch (error) {
      console.error('[Migration] Failed to import InventoryChangeModel:', error)
      return null
    }
  }
  return InventoryChangeModel
}

export async function POST() {
  try {
    await connectToDatabase()
    console.log('Starting inventory migration...')

    const InventoryChangeModel = await getInventoryChangeModel()
    if (!InventoryChangeModel) {
      return NextResponse.json(
        { error: 'Failed to load InventoryChangeModel' },
        { status: 500 }
      )
    }

    // Get all Viva Raw products
    const vivaRawProducts = await ProductModel.find({ 
      supplier: { $regex: /viva raw/i } 
    }).lean()

    console.log(`Found ${vivaRawProducts.length} Viva Raw products`)
    
    // Log the Viva Raw products for verification
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vivaRawProducts.forEach((product: any) => {
      console.log(`- ${product.name} (${product.supplier})`)
    })

    // Create a map for quick product lookup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productMap = new Map<string, any>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vivaRawProducts.forEach((product: any) => {
      productMap.set(String(product._id), product)
    })

    // Get all transactions that have Viva Raw products (more specific query)
    const transactions = await TransactionModel.find({
      'products.productId': { $in: vivaRawProducts.map((p: { _id: unknown }) => p._id) }
    }).lean()

    console.log(`Found ${transactions.length} transactions with Viva Raw products`)

    let processedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const transaction of transactions) {
      try {
        const transactionId = transaction._id.toString()
        const tx = transaction as Record<string, unknown>
        
        // Check if this transaction already has inventory changes recorded
        const existingChanges = await InventoryChangeModel.find({ 
          transactionId: transactionId 
        })

        if (existingChanges.length > 0) {
          console.log(`Skipping transaction ${transactionId} - already has ${existingChanges.length} inventory change records`)
          skippedCount++
          continue
        }

        // Check if transaction has any Viva Raw products
        let hasVivaRawProducts = false
        if (tx.products && Array.isArray(tx.products)) {
          for (const productItem of tx.products) {
            if (productItem && productItem.productId) {
              const productId = productItem.productId.toString()
              if (productMap.has(productId)) {
                hasVivaRawProducts = true
                break
              }
            }
          }
        }

        if (!hasVivaRawProducts) {
          console.log(`Skipping transaction ${transactionId} - no Viva Raw products found`)
          skippedCount++
          continue
        }

        // Process sales transactions
        if (tx.type === 'sale' && tx.products && Array.isArray(tx.products)) {
          for (const productItem of tx.products) {
            if (!productItem || !productItem.productId) {
              console.log(`Skipping product item without productId in transaction ${transactionId}`)
              continue
            }
            
            const productId = productItem.productId.toString()
            if (productId && productMap.has(productId)) {
              const product = productMap.get(productId)
              const quantityChange = -(productItem.quantity || 1) // Negative for sales

              await InventoryChangeModel.create({
                transactionId: transactionId,
                productId: productId,
                quantityChange: quantityChange,
                changeType: 'sale',
                timestamp: tx.date || new Date(),
                productName: product.name,
                transactionType: 'sale',
                source: tx.source || 'manual',
                notes: `Historical migration: ${tx.customer || 'Unknown customer'}`
              })
            }
          }
        }

        // Process expense transactions
        if (tx.type === 'expense' && tx.products && Array.isArray(tx.products)) {
          for (const productItem of tx.products) {
            if (!productItem || !productItem.productId) {
              console.log(`Skipping product item without productId in transaction ${transactionId}`)
              continue
            }
            
            const productId = productItem.productId.toString()
            if (productId && productMap.has(productId)) {
              const product = productMap.get(productId)
              const quantityChange = productItem.quantity || 1 // Positive for expenses

              await InventoryChangeModel.create({
                transactionId: transactionId,
                productId: productId,
                quantityChange: quantityChange,
                changeType: 'expense',
                timestamp: tx.date || new Date(),
                productName: product.name,
                transactionType: 'expense',
                source: tx.source || 'manual',
                notes: `Historical migration: ${tx.supplier || 'Unknown supplier'}`
              })
            }
          }
        }

        processedCount++
      } catch (error) {
        console.error(`Error processing transaction ${transaction._id}:`, error)
        console.error(`Transaction data:`, JSON.stringify(transaction, null, 2))
        errorCount++
      }
    }

    const result = {
      message: 'Inventory migration completed',
      stats: {
        totalTransactions: transactions.length,
        processed: processedCount,
        skipped: skippedCount,
        errors: errorCount
      }
    }

    console.log('=== MIGRATION SUMMARY ===')
    console.log(`Total transactions found: ${transactions.length}`)
    console.log(`Successfully processed: ${processedCount}`)
    console.log(`Skipped (already processed): ${skippedCount}`)
    console.log(`Errors: ${errorCount}`)
    console.log('========================')
    
    return NextResponse.json(result)

  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json(
      { error: 'Failed to run migration' },
      { status: 500 }
    )
  }
}
