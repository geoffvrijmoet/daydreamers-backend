import mongoose, { Schema, Document } from 'mongoose'

export interface IInventoryChange extends Document {
  transactionId: mongoose.Types.ObjectId
  productId: mongoose.Types.ObjectId
  quantityChange: number // Negative for sales, positive for purchases
  changeType: 'sale' | 'purchase' | 'adjustment' | 'restoration'
  timestamp: Date
  productName: string
  transactionType: 'sale' | 'expense' | 'training'
  source: string // 'manual', 'shopify', 'square', etc.
  notes?: string
}

const InventoryChangeSchema = new Schema<IInventoryChange>({
  transactionId: {
    type: Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true,
    index: true
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  quantityChange: {
    type: Number,
    required: true
  },
  changeType: {
    type: String,
    enum: ['sale', 'purchase', 'adjustment', 'restoration'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  productName: {
    type: String,
    required: true
  },
  transactionType: {
    type: String,
    enum: ['sale', 'expense', 'training'],
    required: true
  },
  source: {
    type: String,
    required: true
  },
  notes: {
    type: String
  }
})

// Compound index to prevent duplicate changes for the same transaction/product combination
InventoryChangeSchema.index({ transactionId: 1, productId: 1 }, { unique: true })

export const InventoryChangeModel = mongoose.model<IInventoryChange>('InventoryChange', InventoryChangeSchema, 'inventory_changes')
