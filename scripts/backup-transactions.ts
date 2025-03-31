import mongoose from 'mongoose';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
config({ path: path.resolve(__dirname, '../.env.local') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/daydreamers';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

// Define Transaction schema (same as analyze script)
const BaseTransactionSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  type: { type: String, required: true, enum: ['sale', 'expense', 'training', 'purchase'] },
  source: { type: String, required: false, default: 'manual', enum: ['manual', 'shopify', 'square', 'amex', 'gmail', 'excel'] },
  paymentMethod: { type: String },
  notes: { type: String },
  supplier: { type: String },
  supplierOrderNumber: { type: String },
  purchaseCategory: { type: String },
  products: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String },
    quantity: { type: Number },
    unitPrice: { type: Number },
    totalPrice: { type: Number }
  }],
  lineItems: [{
    name: { type: String },
    quantity: { type: Number },
    price: { type: Number },
    grossSalesMoney: {
      amount: { type: Number }
    },
    variationName: { type: String },
    sku: { type: String },
    variant_id: { type: String }
  }]
}, {
  timestamps: true
});

// Register models
const TransactionModel = mongoose.models.Transaction || mongoose.model('Transaction', BaseTransactionSchema);
const BackupModel = mongoose.models.TransactionBackup || mongoose.model('TransactionBackup', BaseTransactionSchema);

async function backupTransactions() {
  try {
    // Drop existing backup collection if it exists
    await mongoose.connection.dropCollection('transactionbackups').catch(() => {
      // Ignore error if collection doesn't exist
      console.log('No existing backup collection to drop');
    });
    console.log('Cleared any existing backups');

    // Get total count
    const totalDocuments = await TransactionModel.countDocuments();
    console.log(`Found ${totalDocuments} transactions to backup`);

    // Process in batches
    const batchSize = 100;
    const batches = Math.ceil(totalDocuments / batchSize);

    console.log(`Processing in ${batches} batches of ${batchSize}`);

    let processed = 0;
    for (let i = 0; i < batches; i++) {
      const transactions = await TransactionModel.find()
        .skip(i * batchSize)
        .limit(batchSize)
        .lean();

      // Add backup timestamp to each document
      const backupDocs = transactions.map(doc => ({
        ...doc,
        _id: new mongoose.Types.ObjectId(), // Generate new _id for backup
        originalId: doc._id, // Store original _id
        backedUpAt: new Date()
      }));

      // Insert batch into backup collection
      await BackupModel.insertMany(backupDocs);
      
      processed += transactions.length;
      console.log(`Processed ${processed}/${totalDocuments} transactions`);
    }

    // Verify backup
    const backupCount = await BackupModel.countDocuments();
    console.log(`\nBackup complete!`);
    console.log(`Original documents: ${totalDocuments}`);
    console.log(`Backed up documents: ${backupCount}`);
    console.log(`Success rate: ${((backupCount / totalDocuments) * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('Error during backup:', error);
    throw error;
  }
}

// Define the main function
async function main() {
  try {
    // Connect to the database
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to database');

    // Run the backup
    await backupTransactions();
    
    // Always disconnect when done
    await mongoose.disconnect();
    console.log('Disconnected from database');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main(); 