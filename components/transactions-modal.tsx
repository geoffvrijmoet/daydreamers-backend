'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { format } from 'date-fns'
import { HomeSyncButton } from './home-sync-button'

interface Transaction {
  _id: string
  date: string
  type: 'sale' | 'expense' | 'training'
  amount: number
  customer?: string
  description?: string
  products?: Array<{
    name: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }>
  lineItems?: Array<{
    name: string
    quantity: number
    price: number
  }>
  source: 'manual' | 'shopify' | 'square' | 'amex'
  paymentMethod?: string
  isTaxable?: boolean
  preTaxAmount?: number
  taxAmount?: number
  tip?: number
  discount?: number
  shipping?: number
}

type TransactionsModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TransactionsModal({ open, onOpenChange }: TransactionsModalProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (open) {
      fetchTransactions()
    }
  }, [open])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/transactions?limit=1000')
      if (!response.ok) throw new Error('Failed to fetch transactions')
      const data = await response.json()
      setTransactions(data.transactions)
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  // Group transactions by date
  const groupedTransactions = transactions.reduce((groups, transaction) => {
    const date = format(new Date(transaction.date), 'yyyy-MM-dd')
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(transaction)
    return groups
  }, {} as Record<string, Transaction[]>)

  // Calculate daily totals
  const dailyTotals = Object.entries(groupedTransactions).reduce((totals, [date, transactions]) => {
    totals[date] = transactions.reduce((sum, t) => sum + t.amount, 0)
    return totals
  }, {} as Record<string, number>)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Transactions</DialogTitle>
          <HomeSyncButton />
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedTransactions)
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([date, transactions]) => (
                <div key={date} className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">
                      {format(new Date(date), 'MMMM d, yyyy')}
                    </h3>
                    <span className="text-sm text-gray-500">
                      Total: ${dailyTotals[date].toFixed(2)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {transactions.map((transaction) => (
                      <div
                        key={transaction._id}
                        className="flex justify-between items-start p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {transaction.type === 'sale'
                                ? transaction.customer
                                : transaction.type === 'expense'
                                ? 'Expense'
                                : 'Training'}
                            </span>
                            <span className="text-sm text-gray-500">
                              {format(new Date(transaction.date), 'h:mm a')}
                            </span>
                          </div>
                          {transaction.description && (
                            <p className="text-sm text-gray-600">{transaction.description}</p>
                          )}
                          {transaction.products && (
                            <ul className="text-sm text-gray-600">
                              {transaction.products.map((product, index) => (
                                <li key={index}>
                                  {product.quantity}x {product.name} - ${product.totalPrice.toFixed(2)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-medium">${transaction.amount.toFixed(2)}</div>
                          {transaction.tip && (
                            <div className="text-sm text-gray-500">
                              Tip: ${transaction.tip.toFixed(2)}
                            </div>
                          )}
                          {transaction.taxAmount && (
                            <div className="text-sm text-gray-500">
                              Tax: ${transaction.taxAmount.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
} 