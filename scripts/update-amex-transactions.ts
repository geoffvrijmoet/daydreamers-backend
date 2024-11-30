const { getDb } = require('../lib/db')

async function updateAmexTransactions() {
  const db = await getDb()
  
  try {
    const result = await db.collection('transactions').updateMany(
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