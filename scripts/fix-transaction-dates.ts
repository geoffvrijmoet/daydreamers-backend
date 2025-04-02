import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://daydreamers_backend:gFY0o5mYiwyZgARK@craptasks.fsyuj8y.mongodb.net/daydreamers?retryWrites=true&w=majority'

async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')
  } catch (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }
}

const TransactionSchema = new mongoose.Schema({
  date: { type: mongoose.Schema.Types.Mixed }, // Allow both Date and String to find existing data
  amount: Number,
  type: String
})

const TransactionModel = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema)

async function fixTransactionDates() {
  try {
    await connectToDatabase()
    console.log('Connected to database')

    // Find all transactions where date is a string
    const transactions = await TransactionModel.find({
      date: { $type: 'string' }
    })

    console.log(`Found ${transactions.length} transactions with string dates`)

    let updated = 0
    for (const transaction of transactions) {
      const oldDate = transaction.date
      transaction.date = new Date(oldDate)
      await transaction.save()
      updated++
      console.log(`Updated transaction ${transaction._id}: ${oldDate} -> ${transaction.date}`)
    }

    console.log(`Successfully updated ${updated} transactions`)
    process.exit(0)
  } catch (error) {
    console.error('Error fixing transaction dates:', error)
    process.exit(1)
  }
}

fixTransactionDates() 