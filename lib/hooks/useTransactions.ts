import { useState, useEffect, useCallback } from 'react'
import { Transaction } from '@/types'

type UseTransactionsOptions = {
  startDate?: string
  endDate?: string
}

export function useTransactions(options?: UseTransactionsOptions) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true)
      const queryParams = new URLSearchParams()
      if (options?.startDate) queryParams.set('startDate', options.startDate)
      if (options?.endDate) queryParams.set('endDate', options.endDate)
      
      const response = await fetch(`/api/transactions/combined?${queryParams.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch transactions')
      }
      const data = await response.json()
      setTransactions(data.transactions)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch transactions'))
    } finally {
      setLoading(false)
    }
  }, [options?.startDate, options?.endDate])

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