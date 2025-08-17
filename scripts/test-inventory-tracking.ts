import mongoose from 'mongoose'
import { connectToDatabase } from '../lib/mongoose'
import { InventoryChangeModel } from '../lib/models/inventory-change'
import { updateInventoryForNewTransaction } from '../lib/utils/inventory-management'

async function testInventoryTracking() {
  try {
    await connectToDatabase()
    console.log('Testing inventory tracking system...')

    // Test 1: Check if we have any existing inventory changes
    const existingChanges = await InventoryChangeModel.countDocuments()
    console.log(`Found ${existingChanges} existing inventory changes`)

    // Test 2: Check for duplicate transaction/product combinations
    const duplicates = await InventoryChangeModel.aggregate([
      {
        $group: {
          _id: { transactionId: '$transactionId', productId: '$productId' },
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ])

    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} duplicate transaction/product combinations:`)
      duplicates.forEach(dup => {
        console.log(`  - Transaction: ${dup._id.transactionId}, Product: ${dup._id.productId}, Count: ${dup.count}`)
      })
    } else {
      console.log('✅ No duplicate transaction/product combinations found')
    }

    // Test 3: Check inventory changes by source
    const changesBySource = await InventoryChangeModel.aggregate([
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantityChange' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ])

    console.log('\nInventory changes by source:')
    changesBySource.forEach(source => {
      console.log(`  ${source._id}: ${source.count} changes, total quantity: ${source.totalQuantity}`)
    })

    // Test 4: Check inventory changes by type
    const changesByType = await InventoryChangeModel.aggregate([
      {
        $group: {
          _id: '$changeType',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantityChange' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ])

    console.log('\nInventory changes by type:')
    changesByType.forEach(type => {
      console.log(`  ${type._id}: ${type.count} changes, total quantity: ${type.totalQuantity}`)
    })

    // Test 5: Check recent changes
    const recentChanges = await InventoryChangeModel.find()
      .sort({ timestamp: -1 })
      .limit(5)
      .populate('productId', 'name')

    console.log('\nMost recent inventory changes:')
    recentChanges.forEach(change => {
      console.log(`  ${change.timestamp.toISOString()}: ${change.productName} ${change.quantityChange > 0 ? '+' : ''}${change.quantityChange} (${change.source})`)
    })

    console.log('\n✅ Inventory tracking system test completed')

  } catch (error) {
    console.error('❌ Test failed:', error)
  } finally {
    await mongoose.disconnect()
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testInventoryTracking()
}

export { testInventoryTracking }
