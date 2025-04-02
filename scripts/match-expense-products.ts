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
    productId: { type: mongoose.Schema.Types.Mixed }, // Allow both ObjectId and string
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
const ProductModel = mongoose.models.Product || mongoose.model('Product', new mongoose.Schema({}, { strict: false }));

async function findMatchingProduct(productName: string): Promise<mongoose.Types.ObjectId | undefined> {
  try {
    // First try exact match
    let product = await ProductModel.findOne({ name: productName });
    if (product) return product._id;

    // If no exact match, try matching base product name
    const baseName = productName.split(' - ')[0];
    product = await ProductModel.findOne({ name: baseName });
    if (product) return product._id;

    // Try case-insensitive match
    product = await ProductModel.findOne({ 
      name: { $regex: new RegExp(`^${productName}$`, 'i') }
    });
    if (product) return product._id;

    // Try case-insensitive base name match
    product = await ProductModel.findOne({ 
      name: { $regex: new RegExp(`^${baseName}$`, 'i') }
    });
    if (product) return product._id;

    return undefined;
  } catch (error) {
    console.error(`Error finding matching product for "${productName}":`, error);
    return undefined;
  }
}

function isObjectIdString(value: any): boolean {
  return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
}

async function matchExpenseProducts(): Promise<void> {
  try {
    const transactions = await TransactionModel.find({
      type: 'expense',
      products: { $exists: true, $ne: [] }
    });

    console.log(`Found ${transactions.length} transactions with products`);
    let updatedCount = 0;
    let skippedCount = 0;
    let matchedProducts = 0;
    let unmatchedProducts = 0;
    const unmatchedNames = new Set<string>();

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      console.log(`\nProcessing transaction ${transaction._id}:`);
      let needsUpdate = false;

      for (let j = 0; j < transaction.products.length; j++) {
        const product = transaction.products[j];
        console.log(`  Product ${j + 1}: "${product.name}"`);
        console.log(`    Current productId: ${product.productId}`);

        // Always try to find a matching product if the current ID is not already an ObjectId instance
        if (!(product.productId instanceof mongoose.Types.ObjectId)) {
          const matchedProductId = await findMatchingProduct(product.name);
          if (matchedProductId) {
            console.log(`    Found matching product: ${matchedProductId}`);
            product.productId = matchedProductId;
            needsUpdate = true;
            matchedProducts++;
          } else {
            console.log(`    No matching product found`);
            unmatchedProducts++;
            unmatchedNames.add(product.name);
          }
        } else {
          console.log(`    Skipping: Already a valid ObjectId instance`);
        }
      }

      if (needsUpdate) {
        const updatedTransaction = await TransactionModel.findByIdAndUpdate(
          transaction._id,
          { products: transaction.products },
          { new: true }
        );
        console.log(`  Updated transaction with new product IDs`);
        updatedCount++;
      } else {
        console.log(`  No updates needed for this transaction`);
        skippedCount++;
      }

      console.log(`Processed ${i + 1}/${transactions.length} transactions`);
    }

    console.log('\nMatching complete!');
    console.log(`Total transactions processed: ${transactions.length}`);
    console.log(`Transactions updated: ${updatedCount}`);
    console.log(`Transactions skipped: ${skippedCount}`);
    console.log(`Products matched: ${matchedProducts}`);
    console.log(`Products unmatched: ${unmatchedProducts}`);
    if (unmatchedNames.size > 0) {
      console.log('\nUnmatched product names:');
      Array.from(unmatchedNames).forEach(name => console.log(`- ${name}`));
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

// Define the main function
async function main() {
  try {
    // Connect to the database
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to database');

    // Run the matching process
    await matchExpenseProducts();
    
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