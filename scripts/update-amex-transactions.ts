import { connectToDatabase } from '../lib/mongoose'
import mongoose from 'mongoose'

async function updateAmexTransactions() {
  await connectToDatabase()
  
  try {
    const result = await (mongoose.connection.db as any).collection('transactions').updateMany(
      { source: 'gmail' },
      [{
        $set: {
          merchant: null,
          description: {
            $concat: [
              "Charge for $",
              { $toString: { $round: ["$amount", 2] } }
            ]
          }
        }
      }]
    )

    console.log(`Updated ${result.modifiedCount} transactions`)
  } catch (error) {
    console.error('Error updating transactions:', error)
  }
}

// Run the migration
updateAmexTransactions() 