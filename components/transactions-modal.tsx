'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HomeSyncButton } from './home-sync-button'
import { toEasternTime, formatInEasternTime } from '@/lib/utils/dates'

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
    const date = formatInEasternTime(toEasternTime(transaction.date), 'yyyy-MM-dd')
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(transaction)
    return groups
  }, {} as Record<string, Transaction[]>)

  // Calculate daily totals
  const dailyTotals = Object.entries(groupedTransactions).reduce((totals, [date, transactions]) => {
    const dayStats = transactions.reduce((acc, t) => {
      acc.revenue += t.amount
      acc.preTaxAmount += t.preTaxAmount || 0
      acc.salesTax += t.taxAmount || 0
      // Only count sales tax from manual transactions (not Square/Shopify)
      if (t.source === 'manual' && t.taxAmount) {
        acc.nonPlatformSalesTax += t.taxAmount
      }
      return acc
    }, { revenue: 0, preTaxAmount: 0, salesTax: 0, nonPlatformSalesTax: 0 })
    
    totals[date] = dayStats
    return totals
  }, {} as Record<string, { revenue: number, preTaxAmount: number, salesTax: number, nonPlatformSalesTax: number }>)

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
                      {formatInEasternTime(toEasternTime(date), 'MMMM d, yyyy')}
                    </h3>
                    <div className="text-right text-sm">
                      <div className="text-gray-900">
                        Revenue: ${dailyTotals[date].revenue.toFixed(2)}
                        {dailyTotals[date].preTaxAmount > 0 && (
                          <span className="text-gray-500">
                            {' '}(Sales: ${dailyTotals[date].preTaxAmount.toFixed(2)})
                          </span>
                        )}
                      </div>
                      {dailyTotals[date].salesTax > 0 && (
                        <div className="text-gray-500">
                          Sales Tax: ${dailyTotals[date].salesTax.toFixed(2)}
                          {dailyTotals[date].nonPlatformSalesTax > 0 && (
                            <span>
                              {' '}(Non-platform: ${dailyTotals[date].nonPlatformSalesTax.toFixed(2)})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
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
                              {formatInEasternTime(toEasternTime(transaction.date), 'h:mm a')}
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