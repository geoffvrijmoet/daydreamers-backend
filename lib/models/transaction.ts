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
  shopifyOrderId?: string;
  shopifyTotalTax?: number;
  shopifySubtotalPrice?: number;
  shopifyTotalPrice?: number;
  shopifyPaymentGateway?: string;
}

// Expense-specific interface
interface IExpenseTransaction extends IBaseTransaction {
  type: 'expense';
  expenseType: string;
  expenseLabel: string;
  supplier?: string;
  supplierOrderNumber?: string;
  paymentProcessing?: IPaymentProcessing;
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

// Base schema with common fields
const BaseTransactionSchema = new Schema<IBaseTransaction>({
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  type: { type: String, required: true, enum: ['sale', 'expense', 'training'] },
  source: { type: String, required: true, enum: ['manual', 'shopify', 'square', 'amex'] },
  paymentMethod: { type: String },
  notes: { type: String },
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
  shopifyOrderId: { type: String },
  shopifyTotalTax: { type: Number },
  shopifySubtotalPrice: { type: Number },
  shopifyTotalPrice: { type: Number },
  shopifyPaymentGateway: { type: String }
});

// Expense transaction schema
const ExpenseTransactionSchema = new Schema<IExpenseTransaction>({
  expenseType: { type: String, required: true },
  expenseLabel: { type: String, required: true },
  supplier: { type: String },
  supplierOrderNumber: { type: String },
  paymentProcessing: PaymentProcessingSchema
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
const TransactionModel = mongoose.models.Transaction || mongoose.model<IBaseTransaction>('Transaction', BaseTransactionSchema);

// Add discriminators for different transaction types
TransactionModel.discriminator('sale', SaleTransactionSchema);
TransactionModel.discriminator('expense', ExpenseTransactionSchema);
TransactionModel.discriminator('training', TrainingTransactionSchema);

// Indexes for common queries
TransactionModel.schema.index({ date: 1 });
TransactionModel.schema.index({ type: 1 });
TransactionModel.schema.index({ source: 1 });
TransactionModel.schema.index({ 'products.productId': 1 });
TransactionModel.schema.index({ customer: 1 });
TransactionModel.schema.index({ supplier: 1 });
TransactionModel.schema.index({ trainer: 1 });

export default TransactionModel;
export type { ITransaction, ISaleTransaction, IExpenseTransaction, ITrainingTransaction, ILineItem, IPaymentProcessing };

/**
 * Helper functions for working with transactions
 */

/**
 * Formats a date as YYYY-MM-DD for MongoDB storage
 */
export function formatTransactionDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
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