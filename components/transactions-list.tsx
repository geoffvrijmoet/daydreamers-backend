'use client'

import { Card } from "@/components/ui/card"
import { useTransactions } from "@/lib/hooks/useTransactions"
import { useMemo } from "react"

type GroupedTransactions = {
  [date: string]: {
    transactions: Array<{
      id: string
      description: string
      amount: number
      type: 'sale' | 'purchase'
      source?: 'square' | 'shopify' | 'gmail'
    }>
    totalAmount: number
    count: number
  }
}

export function TransactionsList() {
  const { transactions, loading, error } = useTransactions()

  const groupedTransactions = useMemo(() => {
    return transactions.reduce((acc: GroupedTransactions, transaction) => {
      // Get date without time
      const dateKey = new Date(transaction.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })

      if (!acc[dateKey]) {
        acc[dateKey] = {
          transactions: [],
          totalAmount: 0,
          count: 0
        }
      }

      acc[dateKey].transactions.push({
        id: transaction.id,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        source: transaction.source
      })
      acc[dateKey].totalAmount += transaction.amount
      acc[dateKey].count += 1

      return acc
    }, {})
  }, [transactions])

  if (loading) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent Transactions</h2>
        <p className="text-gray-600 dark:text-gray-400">Loading transactions...</p>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent Transactions</h2>
        <p className="text-red-600">Error: {error.message}</p>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent Transactions</h2>
      <div className="space-y-6">
        {Object.entries(groupedTransactions)
          .sort(([dateA], [dateB]) => 
            new Date(dateB).getTime() - new Date(dateA).getTime()
          )
          .map(([date, { transactions, totalAmount, count }]) => (
            <div key={date} className="space-y-2">
              {/* Date header with daily total */}
              <div className="flex justify-between items-center pb-2 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                  {date}
                </h3>
                <div className="text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {count} transaction{count !== 1 ? 's' : ''} •{' '}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>
              
              {/* Transactions for this date */}
              <div className="space-y-3">
                {transactions.map((transaction) => (
                  <div key={transaction.id} className="flex justify-between items-start pl-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {transaction.description}
                      </p>
                      {transaction.source && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                          via {transaction.source}
                        </span>
                      )}
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${transaction.type === 'sale' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'}`}>
                      ${transaction.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </Card>
  )
} 