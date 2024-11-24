'use client'

import { Card } from "@/components/ui/card"
import { useTransactions } from "@/lib/hooks/useTransactions"
import { useMemo, useState } from "react"

type EditingTransaction = {
  id: string
  description: string
  amount: number
  type: 'sale' | 'purchase'
  customer?: string
  paymentMethod?: string
  date: string
}

type GroupedTransactions = {
  [date: string]: {
    transactions: Array<{
      id: string
      description: string
      amount: number
      type: 'sale' | 'purchase'
      source?: 'square' | 'shopify' | 'gmail' | 'manual'
      customer?: string
      paymentMethod?: string
      date: string
    }>
    totalAmount: number
    count: number
  }
}

export function TransactionsList() {
  const { transactions, loading, error, refreshTransactions } = useTransactions()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTransaction, setEditingTransaction] = useState<EditingTransaction | null>(null)
  const [saving, setSaving] = useState(false)

  const groupedTransactions = useMemo(() => {
    return transactions.reduce((acc: GroupedTransactions, transaction) => {
      const transactionDate = new Date(transaction.date)
      const dateKey = transactionDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/New_York'
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
        source: transaction.source,
        customer: transaction.customer,
        paymentMethod: transaction.paymentMethod,
        date: transaction.date
      })
      acc[dateKey].totalAmount += transaction.amount
      acc[dateKey].count += 1

      return acc
    }, {})
  }, [transactions])

  const handleEdit = (transaction: any) => {
    setEditingId(transaction.id)
    setEditingTransaction({
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      customer: transaction.customer,
      paymentMethod: transaction.paymentMethod,
      date: transaction.date
    })
  }

  const handleSave = async () => {
    if (!editingTransaction) return
    
    try {
      setSaving(true)
      const response = await fetch('/api/transactions/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTransaction)
      })

      if (!response.ok) {
        throw new Error('Failed to update transaction')
      }

      setEditingId(null)
      setEditingTransaction(null)
      refreshTransactions()
    } catch (err) {
      console.error('Failed to save transaction:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditingTransaction(null)
  }

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
      <div className="max-h-[400px] overflow-auto pr-2">
        <div className="space-y-6">
          {Object.entries(groupedTransactions)
            .sort(([dateA], [dateB]) => 
              new Date(dateB).getTime() - new Date(dateA).getTime()
            )
            .map(([date, { transactions, totalAmount, count }]) => (
              <div key={date} className="space-y-2">
                <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 py-2">
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
                </div>
                
                <div className="space-y-3">
                  {transactions.map((transaction) => (
                    <div key={transaction.id} className="flex justify-between items-start pl-4">
                      <div className="flex-grow">
                        {editingId === transaction.id ? (
                          // Editing mode
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editingTransaction?.description || ''}
                              onChange={e => setEditingTransaction(prev => prev ? { ...prev, description: e.target.value } : null)}
                              className="block w-full text-sm rounded-md border-gray-300"
                              placeholder="Description"
                            />
                            {transaction.source === 'manual' && (
                              <>
                                <input
                                  type="text"
                                  value={editingTransaction?.customer || ''}
                                  onChange={e => setEditingTransaction(prev => prev ? { ...prev, customer: e.target.value } : null)}
                                  className="block w-full text-sm rounded-md border-gray-300"
                                  placeholder="Customer"
                                />
                                <select
                                  value={editingTransaction?.paymentMethod || ''}
                                  onChange={e => setEditingTransaction(prev => prev ? { ...prev, paymentMethod: e.target.value } : null)}
                                  className="block w-full text-sm rounded-md border-gray-300"
                                >
                                  <option value="Venmo">Venmo</option>
                                  <option value="Cash">Cash</option>
                                  <option value="Check">Check</option>
                                  <option value="Other">Other</option>
                                </select>
                              </>
                            )}
                            <input
                              type="number"
                              step="0.01"
                              value={editingTransaction?.amount || 0}
                              onChange={e => setEditingTransaction(prev => prev ? { ...prev, amount: Number(e.target.value) } : null)}
                              className="block w-full text-sm rounded-md border-gray-300"
                            />
                            <div className="flex space-x-2">
                              <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-2 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
                              >
                                {saving ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={handleCancel}
                                className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          // Display mode
                          <>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {transaction.description}
                            </p>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {transaction.source === 'manual' && (
                                <>
                                  {transaction.customer && <span>Customer: {transaction.customer} • </span>}
                                  {transaction.paymentMethod && <span>via {transaction.paymentMethod}</span>}
                                </>
                              )}
                              {transaction.source && transaction.source !== 'manual' && (
                                <span className="capitalize">via {transaction.source}</span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                          ${transaction.type === 'sale' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' 
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'}`}>
                          ${transaction.amount.toFixed(2)}
                        </span>
                        {transaction.source === 'manual' && editingId !== transaction.id && (
                          <button
                            onClick={() => handleEdit(transaction)}
                            className="text-sm text-gray-500 hover:text-gray-700"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </Card>
  )
} 