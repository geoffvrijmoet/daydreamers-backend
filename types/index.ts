export type Transaction = {
  id: string
  date: string
  type: 'sale' | 'purchase'
  amount: number
  description: string
}

export type SalesData = {
  [date: string]: {
    amount: number
    count: number
  }
} 