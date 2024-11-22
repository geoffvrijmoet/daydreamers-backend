'use client'

import { Card } from "@/components/ui/card"
import { useTransactions } from "@/lib/hooks/useTransactions"
import { Transaction } from "@/types"

export function TransactionsList() {
  const { transactions, loading, error } = useTransactions()

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
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {transactions.map((transaction) => (
          <div key={transaction.id} className="py-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {transaction.description}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(transaction.date).toLocaleDateString()}
                </p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                ${transaction.type === 'sale' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'}`}>
                ${transaction.amount.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
} 