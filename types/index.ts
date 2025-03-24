export interface BaseTransaction {
  date: string
  type: 'sale' | 'purchase' | 'refund'
  amount: number
  description: string
  source: 'square' | 'shopify' | 'amex'
}

export interface Transaction {
  _id: string
  id: string
  date: string
  type: 'sale' | 'purchase'
  amount: number
  description: string
  source?: 'square' | 'shopify' | 'gmail' | 'manual' | 'venmo'
  customer?: string
  paymentMethod?: string
  lineItems?: Array<{
    name: string
    quantity: number
    price: number
    sku?: string
    variant_id?: string
  }>
  products?: Array<{
    name: string
    quantity: number
    unitPrice: number
    totalPrice: number
    productId?: string
  }>
  productsTotal?: number
  taxAmount?: number
  preTaxAmount?: number
  tip?: number
  discount?: number
  status: 'completed' | 'cancelled' | 'refunded'
  refundAmount?: number
  refundDate?: string
  voidReason?: string
  voidedAt?: string
  supplier?: string
  supplierOrderNumber?: string
  notes?: string
  createdAt: string
  updatedAt: string
  // Shopify specific fields
  shopifyOrderId?: string
  shopifyTotalTax?: number
  shopifySubtotalPrice?: number
  shopifyTotalPrice?: number
  shopifyProcessingFee?: number
  shopifyPaymentGateway?: string
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

export interface Product {
  _id?: string
  id: string
  baseProductName: string
  variantName: string
  name: string
  description?: string
  category: string
  retailPrice: number
  wholesalePrice?: number
  currentStock: number
  minimumStock: number
  lastPurchasePrice: number
  averageCost: number
  supplier?: string
  isProxied: boolean
  proxyOf?: string
  proxyRatio?: number
  costHistory: CostHistoryEntry[]
  totalSpent: number
  totalPurchased: number
  lastRestockDate?: string
  active: boolean
  squareId?: string
  squareParentId?: string
  shopifyId?: string
  shopifyParentId?: string
  platformMetadata: {
    platform: 'shopify' | 'square'
    productId: string
    variantId?: string
    parentId?: string
    sku?: string
    barcode?: string
    lastSyncedAt: string
    syncStatus: 'success' | 'failed' | 'pending'
    lastError?: string
  }[]
  syncStatus: {
    lastSyncAttempt: string
    lastSuccessfulSync: string
    errors: Array<{
      date: string
      platform: 'shopify' | 'square'
      error: string
    }>
  }
  createdAt?: string
  updatedAt?: string
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