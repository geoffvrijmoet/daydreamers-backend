import { useState, useEffect } from 'react'
import { Transaction } from '@/types'

export function useTransactions(startDate?: Date, endDate?: Date) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchTransactions() {
      try {
        const params = new URLSearchParams()
        if (startDate) params.append('startDate', startDate.toISOString())
        if (endDate) params.append('endDate', endDate.toISOString())

        const response = await fetch(`/api/transactions?${params}`)
        if (!response.ok) throw new Error('Failed to fetch transactions')
        
        const data = await response.json()
        setTransactions(data.transactions)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'))
      } finally {
        setLoading(false)
      }
    }

    fetchTransactions()
  }, [startDate, endDate])

  return { transactions, loading, error }
} 