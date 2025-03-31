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
  source: { type: String, required: true, enum: ['manual', 'shopify', 'square', 'amex'] },
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

// Register model if not already registered
const TransactionModel = mongoose.models.Transaction || mongoose.model('Transaction', BaseTransactionSchema);

async function analyzePurchaseTransactions() {
  // Analyze the structure
  const structureAnalysis = {
    hasSupplier: 0,
    hasSupplierOrderNumber: 0,
    hasPaymentMethod: 0,
    hasNotes: 0,
    hasProducts: 0,
    hasLineItems: 0,
    hasPurchaseCategory: 0,
    uniqueSuppliers: new Set<string>(),
    uniquePaymentMethods: new Set<string>(),
    uniquePurchaseCategories: new Set<string>()
  }

  // Process in batches
  const batchSize = 100;
  const totalDocuments = await mongoose.model('Transaction').countDocuments({ type: 'purchase' });
  const batches = Math.ceil(totalDocuments / batchSize);

  console.log(`Found ${totalDocuments} purchase transactions`);
  console.log(`Processing in ${batches} batches of ${batchSize}`);

  for (let i = 0; i < batches; i++) {
    const transactions = await mongoose.model('Transaction')
      .find({ type: 'purchase' })
      .skip(i * batchSize)
      .limit(batchSize)
      .lean();
    
    transactions.forEach((transaction: any) => {
      if (transaction.supplier) {
        structureAnalysis.hasSupplier++
        structureAnalysis.uniqueSuppliers.add(transaction.supplier)
      }
      if (transaction.supplierOrderNumber) structureAnalysis.hasSupplierOrderNumber++
      if (transaction.paymentMethod) {
        structureAnalysis.hasPaymentMethod++
        structureAnalysis.uniquePaymentMethods.add(transaction.paymentMethod)
      }
      if (transaction.notes) structureAnalysis.hasNotes++
      if (transaction.products?.length) structureAnalysis.hasProducts++
      if (transaction.lineItems?.length) structureAnalysis.hasLineItems++
      if (transaction.purchaseCategory) {
        structureAnalysis.hasPurchaseCategory++
        structureAnalysis.uniquePurchaseCategories.add(transaction.purchaseCategory)
      }
    });

    console.log(`Processed batch ${i + 1}/${batches}`);
  }
  
  // Print analysis
  console.log('\nStructure Analysis:')
  console.log('-------------------')
  console.log(`Transactions with supplier: ${structureAnalysis.hasSupplier} (${(structureAnalysis.hasSupplier / totalDocuments * 100).toFixed(1)}%)`)
  console.log(`Transactions with supplier order number: ${structureAnalysis.hasSupplierOrderNumber} (${(structureAnalysis.hasSupplierOrderNumber / totalDocuments * 100).toFixed(1)}%)`)
  console.log(`Transactions with payment method: ${structureAnalysis.hasPaymentMethod} (${(structureAnalysis.hasPaymentMethod / totalDocuments * 100).toFixed(1)}%)`)
  console.log(`Transactions with notes: ${structureAnalysis.hasNotes} (${(structureAnalysis.hasNotes / totalDocuments * 100).toFixed(1)}%)`)
  console.log(`Transactions with products: ${structureAnalysis.hasProducts} (${(structureAnalysis.hasProducts / totalDocuments * 100).toFixed(1)}%)`)
  console.log(`Transactions with line items: ${structureAnalysis.hasLineItems} (${(structureAnalysis.hasLineItems / totalDocuments * 100).toFixed(1)}%)`)
  console.log(`Transactions with purchase category: ${structureAnalysis.hasPurchaseCategory} (${(structureAnalysis.hasPurchaseCategory / totalDocuments * 100).toFixed(1)}%)`)
  
  console.log('\nUnique Values:')
  console.log('--------------')
  console.log('Unique Suppliers:', Array.from(structureAnalysis.uniqueSuppliers))
  console.log('Unique Payment Methods:', Array.from(structureAnalysis.uniquePaymentMethods))
  console.log('Unique Purchase Categories:', Array.from(structureAnalysis.uniquePurchaseCategories))
  
  // Sample a few transactions
  console.log('\nSample Transactions:')
  console.log('-------------------')
  const sampleTransactions = await mongoose.model('Transaction')
    .find({ type: 'purchase' })
    .limit(3)
    .lean();
  
  for (let i = 0; i < sampleTransactions.length; i++) {
    const transaction = sampleTransactions[i];
    console.log(`\nTransaction ${i + 1}:`)
    console.log(JSON.stringify(transaction, null, 2))
  }
}

// Define the main function
async function main() {
  try {
    // Connect to the database
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to database');

    // Run the analysis
    await analyzePurchaseTransactions();
    
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