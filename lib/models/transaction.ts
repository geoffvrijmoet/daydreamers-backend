import mongoose, { Schema, Document, Types } from 'mongoose';
import { IProduct } from './Product';

/**
 * MongoDB Transaction Schema
 * 
 * This represents the structure of transactions stored in MongoDB.
 * The schema closely follows the Transaction interface from the types directory
 * but provides more detailed documentation and validation rules.
 */

// Common interfaces for shared fields
interface IBaseTransaction extends Document {
  date: Date;
  amount: number;
  type: 'sale' | 'expense' | 'training';
  source: 'manual' | 'shopify' | 'square' | 'amex';
  paymentMethod?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  platformMetadata?: IPlatformMetadata;
  emailId?: string; // Gmail message ID for Amex transactions
}

interface ILineItem {
  productId: Types.ObjectId | IProduct;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isTaxable: boolean;
}

interface IPaymentProcessing {
  fee: number;
  provider: string;
  transactionId?: string;
}

// Platform-specific metadata interfaces
interface ISquareMetadata {
  orderId: string;
  locationId: string;
  state: 'OPEN' | 'COMPLETED' | 'CANCELED';
  createdAt: string;
  updatedAt: string;
}

interface IShopifyMetadata {
  orderId: string;
  orderNumber: string;
  gateway: string;
  createdAt: string;
  updatedAt: string;
}

interface IPlatformMetadata {
  platform: 'square' | 'shopify';
  orderId: string;
  data: ISquareMetadata | IShopifyMetadata;
}

// Sale-specific interface
interface ISaleTransaction extends IBaseTransaction {
  type: 'sale';
  customer?: string;
  email?: string;
  isTaxable: boolean;
  preTaxAmount: number;
  taxAmount: number;
  products: ILineItem[];
  tip?: number;
  discount?: number;
  shipping?: number;
  paymentProcessing?: IPaymentProcessing;
  platformMetadata?: IPlatformMetadata;
  shopifyOrderId?: string;
  shopifyTotalTax?: number;
  shopifySubtotalPrice?: number;
  shopifyTotalPrice?: number;
  shopifyPaymentGateway?: string;
  profitCalculation?: {
    lastCalculatedAt: Date;
    totalCost: number;
    totalProfit: number;
    profitMargin: number;
    hasCostData: boolean;
    items: Array<{
      productId: Types.ObjectId;
      quantity: number;
      itemName: string;
      costBasis: number;
      totalCost: number;
      totalPrice: number;
      profit: number;
      profitMargin: number;
    }>;
  };
}

// Expense-specific interface
interface IExpenseTransaction extends IBaseTransaction {
  type: 'expense';
  supplier: string;
  purchaseCategory?: string;
  isRecurring?: boolean;
  supplierOrderNumber?: string;
  // Optional products from parsed invoice emails
  products?: Array<{
    productId?: Types.ObjectId;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    costDiscount: number;
  }>;
}

// Training-specific interface
interface ITrainingTransaction extends IBaseTransaction {
  type: 'training';
  trainer: string;
  clientName: string;
  dogName: string;
  sessionNotes?: string;
  revenue: number;
  trainingAgency?: string;
}

// Combined type
type ITransaction = ISaleTransaction | IExpenseTransaction | ITrainingTransaction;

// Platform metadata schema
const PlatformMetadataSchema = new Schema<IPlatformMetadata>({
  platform: { type: String, required: true, enum: ['square', 'shopify'] },
  orderId: { type: String, required: true },
  data: { type: Schema.Types.Mixed, required: true }
});

// Base schema with common fields
const BaseTransactionSchema = new Schema<IBaseTransaction>({
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  type: { type: String, required: true, enum: ['sale', 'expense', 'training'] },
  source: { type: String, required: true, enum: ['manual', 'shopify', 'square', 'amex'] },
  paymentMethod: { type: String },
  notes: { type: String },
  platformMetadata: PlatformMetadataSchema,
  emailId: { type: String }, // Gmail message ID for Amex transactions
}, {
  timestamps: true,
  discriminatorKey: 'type'
});

// Line item schema for products
const LineItemSchema = new Schema<ILineItem>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  isTaxable: { type: Boolean, required: true }
});

// Schema for products from emails
const EmailProductSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  costDiscount: { type: Number, default: 0 }
});

// Payment processing schema
const PaymentProcessingSchema = new Schema<IPaymentProcessing>({
  fee: { type: Number, required: true },
  provider: { type: String, required: true },
  transactionId: { type: String }
});

// Sale transaction schema
const SaleTransactionSchema = new Schema<ISaleTransaction>({
  customer: { type: String },
  email: { type: String },
  isTaxable: { type: Boolean, required: true },
  preTaxAmount: { type: Number, required: true },
  taxAmount: { type: Number, required: true },
  products: [LineItemSchema],
  tip: { type: Number },
  discount: { type: Number },
  shipping: { type: Number },
  paymentProcessing: PaymentProcessingSchema,
  platformMetadata: PlatformMetadataSchema,
  shopifyOrderId: { type: String },
  shopifyTotalTax: { type: Number },
  shopifySubtotalPrice: { type: Number },
  shopifyTotalPrice: { type: Number },
  shopifyPaymentGateway: { type: String },
  profitCalculation: {
    lastCalculatedAt: { type: Date },
    totalCost: { type: Number },
    totalProfit: { type: Number },
    profitMargin: { type: Number },
    hasCostData: { type: Boolean },
    items: [{
      productId: { type: Schema.Types.ObjectId, ref: 'Product' },
      quantity: { type: Number },
      itemName: { type: String },
      costBasis: { type: Number },
      totalCost: { type: Number },
      totalPrice: { type: Number },
      profit: { type: Number },
      profitMargin: { type: Number }
    }]
  }
});

// Expense transaction schema
const ExpenseTransactionSchema = new Schema<IExpenseTransaction>({
  supplier: { type: String, required: true },
  purchaseCategory: { type: String },
  supplierOrderNumber: { type: String },
  isRecurring: { type: Boolean },
  // Add products field for invoice email products
  products: [EmailProductSchema]
});

// Training transaction schema
const TrainingTransactionSchema = new Schema<ITrainingTransaction>({
  trainer: { type: String, required: true },
  clientName: { type: String, required: true },
  dogName: { type: String, required: true },
  sessionNotes: { type: String },
  revenue: { type: Number, required: true },
  trainingAgency: { type: String }
});

// Create the base model
const TransactionModel = (mongoose.models.Transaction || mongoose.model<IBaseTransaction>('Transaction', BaseTransactionSchema)) as mongoose.Model<IBaseTransaction> & {
  discriminators?: { [key: string]: mongoose.Model<ISaleTransaction | IExpenseTransaction | ITrainingTransaction> };
};

// Add discriminators for different transaction types if they don't already exist
if (!TransactionModel.discriminators?.['sale']) {
  TransactionModel.discriminator('sale', SaleTransactionSchema);
}
if (!TransactionModel.discriminators?.['expense']) {
  TransactionModel.discriminator('expense', ExpenseTransactionSchema);
}
if (!TransactionModel.discriminators?.['training']) {
  TransactionModel.discriminator('training', TrainingTransactionSchema);
}

// Indexes for common queries
TransactionModel.schema.index({ date: 1 });
TransactionModel.schema.index({ type: 1 });
TransactionModel.schema.index({ source: 1 });
TransactionModel.schema.index({ 'products.productId': 1 });
TransactionModel.schema.index({ customer: 1 });
TransactionModel.schema.index({ supplier: 1 });
TransactionModel.schema.index({ trainer: 1 });
TransactionModel.schema.index({ id: 1 }, { unique: true });

// Add index for platformMetadata.orderId to ensure no duplicate orders
TransactionModel.schema.index({ 'platformMetadata.platform': 1, 'platformMetadata.orderId': 1 }, { unique: true, sparse: true });

export default TransactionModel;
export type { 
  ITransaction, 
  ISaleTransaction, 
  IExpenseTransaction, 
  ITrainingTransaction, 
  ILineItem, 
  IPaymentProcessing,
  IPlatformMetadata,
  ISquareMetadata,
  IShopifyMetadata 
};

/**
 * Helper functions for working with transactions
 */

/**
 * Formats a date as YYYY-MM-DD for MongoDB storage
 */
export function formatTransactionDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const estDate = new Date(dateObj.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return `${estDate.getFullYear()}-${String(estDate.getMonth() + 1).padStart(2, '0')}-${String(estDate.getDate()).padStart(2, '0')}`;
}

/**
 * Determines the appropriate source value based on payment method
 */
export function determineTransactionSource(paymentMethod: string): 'square' | 'shopify' | 'manual' {
  if (paymentMethod === 'Square') return 'square';
  if (paymentMethod === 'Shopify') return 'shopify';
  return 'manual'; // Cash, Venmo, Zelle, Cash App, etc. are all 'manual'
}

/**
 * Creates a unique ID for a transaction based on source and existing ID
 */
export function createTransactionId(source: string, existingId?: string): string {
  if (!existingId) {
    // Generate a timestamp-based ID if none exists
    const timestamp = new Date().getTime();
    const random = Math.floor(Math.random() * 1000);
    return `${source}_${timestamp}_${random}`;
  }
  
  // For existing IDs, prefix with source if not already prefixed
  if (existingId.startsWith(`${source}_`)) return existingId;
  return `${source}_${existingId}`;
} 