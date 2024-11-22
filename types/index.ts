export type Transaction = {
  id: string
  date: string
  type: 'sale' | 'purchase'
  amount: number
  description: string
  source?: 'square' | 'shopify' | 'gmail'
  items?: TransactionItem[]
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
  source: 'square' | 'shopify' | 'gmail'
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