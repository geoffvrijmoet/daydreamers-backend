import { ObjectId } from 'mongodb'

export interface BaseTransaction {
  date: string
  type: 'sale' | 'purchase' | 'refund'
  amount: number
  description: string
  source: 'square' | 'shopify' | 'amex'
}

export interface Transaction extends BaseTransaction {
  _id: ObjectId
  id: string
  date: string
  type: 'sale' | 'refund'
  amount: number
  preTaxAmount?: number
  taxAmount?: number
  description: string
  source: 'square' | 'shopify' | 'amex'
  lineItems?: {
    name: string
    quantity: number
    price: number
    sku?: string
    variant_id?: string
  }[]
  customer?: string
  paymentMethod?: string
  status: 'completed' | 'cancelled' | 'refunded'
  refundAmount?: number
  refundDate?: string
  createdAt: string
  updatedAt: string
}

export type TransactionItem = {
  productId: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export type CostHistoryEntry = {
  date: string
  quantity: number
  unitPrice: number
  totalPrice: number
  source: 'square' | 'shopify' | 'gmail' | 'manual'
  invoiceId?: string
  notes?: string
}

export type Product = {
  id: string
  name: string
  sku: string
  description?: string
  lastPurchasePrice: number  // Most recent purchase price
  averageCost: number       // Weighted average of all purchases
  retailPrice: number       // Current selling price
  wholesalePrice?: number
  currentStock: number
  minimumStock: number
  supplier?: string
  category?: string
  lastRestockDate?: string
  squareId?: string
  squareParentId?: string
  shopifyId?: string
  barcode?: string
  active: boolean
  costHistory: CostHistoryEntry[]
  totalSpent: number
  totalPurchased: number
}

export type SalesData = {
  [date: string]: {
    amount: number
    count: number
    profit?: number
  }
}

export type EmailTransaction = {
  id: string
  date: string
  amount: number
  description: string
  merchant: string
  cardLast4: string
  emailId: string
  source: 'gmail'
  type: 'purchase'
  supplier?: string
  supplierOrderNumber?: string
  products?: Array<{
    productId: string
    name: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }>
}

export type GmailCredentials = {
  accessToken: string
  refreshToken: string
  expiryDate: number
} 