import { useState, useEffect, useCallback } from 'react'
import { Transaction } from '@/types'

export function useTransactions(startDate?: Date, endDate?: Date) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      const defaultStartDate = new Date()
      defaultStartDate.setDate(defaultStartDate.getDate() - 90)
      
      params.append('startDate', (startDate || defaultStartDate).toISOString())
      params.append('endDate', (endDate || new Date()).toISOString())

      console.log('Fetching transactions with params:', Object.fromEntries(params))
      const response = await fetch(`/api/transactions/combined?${params}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch transactions')
      }
      
      const data = await response.json()
      console.log('Received transactions:', data.transactions?.length || 0)
      setTransactions(data.transactions || [])
    } catch (err) {
      console.error('Transaction fetch error:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  return { 
    transactions, 
    loading, 
    error,
    refreshTransactions: fetchTransactions
  }
} 