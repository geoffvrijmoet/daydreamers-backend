'use client'

import { useState, useEffect } from 'react'
import { Card } from "@/components/ui/card"
import { EmailTransaction } from '@/types'

export function AmexTransactions() {
  const [transactions, setTransactions] = useState<EmailTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [debugLogs, setDebugLogs] = useState<string[]>([])

  // Add log to both console and state
  const addLog = (message: string, data?: any) => {
    const timestamp = new Date().toISOString()
    const logMessage = data 
      ? `${message}\n${JSON.stringify(data, null, 2)}`
      : message
    
    console.log(logMessage)
    setDebugLogs(prev => [...prev, `[${timestamp}] ${logMessage}`])
  }

  async function fetchTransactions() {
    try {
      setLoading(true)
      addLog('=== Starting Amex Transaction Fetch ===')
      
      const response = await fetch('/api/gmail/amex')
      if (!response.ok) {
        const errorData = await response.json()
        addLog('Error Response:', errorData)
        throw new Error(errorData.error || 'Failed to fetch transactions')
      }
      
      const data = await response.json()
      addLog(`Found ${data.transactions?.length || 0} transactions:`, data.transactions)
      setTransactions(data.transactions || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load transactions'
      addLog('Error:', { message: errorMessage })
      setError(errorMessage)
    } finally {
      setLoading(false)
      addLog('=== Fetch Complete ===')
    }
  }

  async function handleSync() {
    try {
      setSyncing(true)
      addLog('=== Starting Manual Sync ===')
      
      const response = await fetch('/api/gmail/amex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        addLog('Sync Error Response:', errorData)
        throw new Error(errorData.error || 'Failed to sync transactions')
      }
      
      const data = await response.json()
      addLog(`Sync completed. Found ${data.transactions?.length || 0} transactions:`, data.transactions)
      setTransactions(data.transactions || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sync transactions'
      addLog('Sync Error:', { message: errorMessage })
      setError(errorMessage)
    } finally {
      setSyncing(false)
      addLog('=== Sync Complete ===')
    }
  }

  useEffect(() => {
    fetchTransactions()
  }, [])

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            American Express Purchases
          </h2>
          {error && (
            <p className="text-sm text-red-600 mt-1">{error}</p>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-400 hover:bg-primary-500 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {/* Debug Logs Section */}
      <div className="mb-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono overflow-auto max-h-96">
        <div className="sticky top-0 bg-gray-100 dark:bg-gray-800 py-1 mb-2 font-semibold">
          Debug Logs ({debugLogs.length})
        </div>
        <div className="space-y-2">
          {debugLogs.map((log, i) => (
            <pre key={i} className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words">
              {log}
            </pre>
          ))}
        </div>
        {debugLogs.length === 0 && (
          <div className="text-gray-500">No logs yet</div>
        )}
      </div>

      {/* Transactions List */}
      <div className="space-y-6">
        {transactions.map((transaction) => (
          <div key={transaction.id} className="flex justify-between items-start border-b border-gray-200 dark:border-gray-700 pb-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {transaction.merchant}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(transaction.date).toLocaleDateString()}
              </p>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
              ${transaction.amount.toFixed(2)}
            </span>
          </div>
        ))}
        {transactions.length === 0 && !loading && (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            No transactions found
          </p>
        )}
      </div>
    </Card>
  )
} 