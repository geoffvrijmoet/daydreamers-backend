import { useState, useEffect } from 'react'

type Metrics = {
  // Revenue metrics
  totalRevenue: number // Total including tax
  totalSales: number // Revenue without tax
  totalTaxCollected: number
  
  // Profit metrics
  totalProfit: number
  profitMargin: number
  
  // Expenses
  totalExpenses: number
  
  // Trends
  revenueTrend: number
  salesTrend: number
  profitTrend: number
  expensesTrend: number
}

export function useMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const response = await fetch('/api/metrics')
        if (!response.ok) {
          throw new Error('Failed to fetch metrics')
        }
        const data = await response.json()
        setMetrics(data)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch metrics'))
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [])

  return { metrics, loading, error }
} 