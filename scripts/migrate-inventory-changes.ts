import mongoose from 'mongoose'
import { connectToDatabase } from '../lib/mongoose'
import { InventoryChangeModel } from '../lib/models/inventory-change'

async function migrateInventoryChanges() {
  try {
    await connectToDatabase()
    console.log('Starting inventory changes migration...')

    // Get all transactions with products
    const transactions = await mongoose.connection.db!.collection('transactions').find({
      products: { $exists: true, $ne: [] }
    }).toArray()

    console.log(`Found ${transactions.length} transactions with products`)

    let processed = 0
    let skipped = 0
    let errors = 0

    for (const transaction of transactions) {
      try {
        const products = transaction.products || []
        
        // Skip transactions without Viva Raw products
        const vivaRawProducts = products.filter((product: any) => {
          // Check if product name contains "Viva Raw" or if we can find the product in the database
          return product.name && product.name.includes('Viva Raw')
        })

        if (vivaRawProducts.length === 0) {
          skipped++
          continue
        }

        // Check if inventory changes already exist for this transaction
        const existingChanges = await InventoryChangeModel.find({
          transactionId: transaction._id
        })

        if (existingChanges.length > 0) {
          console.log(`Skipping transaction ${transaction._id} - already has ${existingChanges.length} inventory changes`)
          skipped++
          continue
        }

        // Create inventory change records
        const changeRecords = vivaRawProducts.map((product: any) => ({
          transactionId: transaction._id,
          productId: new mongoose.Types.ObjectId(product.productId),
          quantityChange: transaction.type === 'sale' ? -product.quantity : product.quantity,
          changeType: transaction.type === 'sale' ? 'sale' : 'purchase',
          productName: product.name,
          transactionType: transaction.type,
          source: transaction.source || 'manual',
          timestamp: transaction.createdAt || new Date(),
          notes: `Migrated from existing transaction`
        }))

        // Insert the records
        await InventoryChangeModel.insertMany(changeRecords)
        
        processed++
        console.log(`Processed transaction ${transaction._id} with ${vivaRawProducts.length} Viva Raw products`)

      } catch (error) {
        console.error(`Error processing transaction ${transaction._id}:`, error)
        errors++
      }
    }

    console.log(`Migration complete:`)
    console.log(`- Processed: ${processed} transactions`)
    console.log(`- Skipped: ${skipped} transactions`)
    console.log(`- Errors: ${errors} transactions`)

    // Verify the migration
    const totalChanges = await InventoryChangeModel.countDocuments()
    console.log(`Total inventory changes in database: ${totalChanges}`)

  } catch (error) {
    console.error('Migration failed:', error)
  } finally {
    await mongoose.disconnect()
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  migrateInventoryChanges()
}

export { migrateInventoryChanges }
