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

// Define Transaction schema
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
  expenseType: { type: String },
  expenseLabel: { type: String },
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

// Register model
const TransactionModel = mongoose.models.Transaction || mongoose.model('Transaction', BaseTransactionSchema);

// Map purchase categories to expense types
const categoryToExpenseType: Record<string, string> = {
  'inventory': 'inventory',
  'advertising': 'marketing',
  'software': 'software',
  'shipping': 'shipping',
  'utilities': 'utilities',
  'rent': 'rent',
  'insurance': 'insurance',
  'maintenance': 'maintenance',
  'office': 'office',
  'other': 'other'
};

async function migratePurchaseTransactions() {
  try {
    // Get all purchase transactions
    const purchaseTransactions = await TransactionModel.find({ type: 'purchase' });
    console.log(`Found ${purchaseTransactions.length} purchase transactions to migrate`);

    // Process in batches
    const batchSize = 100;
    const batches = Math.ceil(purchaseTransactions.length / batchSize);

    console.log(`Processing in ${batches} batches of ${batchSize}`);

    let processed = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, purchaseTransactions.length);
      const batch = purchaseTransactions.slice(start, end);

      for (const transaction of batch) {
        try {
          // Determine expense type from purchase category
          const expenseType = categoryToExpenseType[transaction.purchaseCategory?.toLowerCase()] || 'other';
          
          // Determine expense label from supplier or description
          const expenseLabel = transaction.supplier || 
                             transaction.notes?.split('\n')[0] || 
                             'Uncategorized Expense';

          // Update the transaction
          await TransactionModel.findByIdAndUpdate(
            transaction._id,
            {
              $set: {
                type: 'expense',
                expenseType,
                expenseLabel
              }
            },
            { new: true }
          );

          updated++;
          console.log(`Updated transaction ${transaction._id}: ${expenseLabel} (${expenseType})`);
        } catch (error) {
          console.error(`Error updating transaction ${transaction._id}:`, error);
          skipped++;
        }
      }

      processed += batch.length;
      console.log(`Processed ${processed}/${purchaseTransactions.length} transactions`);
    }

    // Print summary
    console.log('\nMigration complete!');
    console.log(`Total transactions processed: ${processed}`);
    console.log(`Successfully updated: ${updated}`);
    console.log(`Failed to update: ${skipped}`);

  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
}

// Define the main function
async function main() {
  try {
    // Connect to the database
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to database');

    // Run the migration
    await migratePurchaseTransactions();
    
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