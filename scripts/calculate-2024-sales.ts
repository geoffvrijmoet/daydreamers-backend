import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://daydreamers_backend:gFY0o5mYiwyZgARK@craptasks.fsyuj8y.mongodb.net/daydreamers?retryWrites=true&w=majority'

async function calculateSales() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')

    const result = await mongoose.connection.collection('transactions').aggregate([
      {
        $match: {
          type: 'sale',
          date: {
            $gte: new Date('2024-01-01T00:00:00.000Z'),
            $lte: new Date('2024-12-31T23:59:59.999Z')
          }
        }
      },
      {
        $group: {
          _id: null,
          totalPreTax: { $sum: '$preTaxAmount' },
          count: { $sum: 1 }
        }
      }
    ]).toArray()

    if (result.length > 0) {
      console.log(`Found ${result[0].count} sales transactions`)
      console.log(`Total preTaxAmount: $${result[0].totalPreTax.toFixed(2)}`)
    } else {
      console.log('No sales found in 2024')
    }

    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

calculateSales() 