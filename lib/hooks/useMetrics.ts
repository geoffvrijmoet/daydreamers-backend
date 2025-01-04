import { useState, useEffect } from 'react'

type MetricsPeriod = {
  totalRevenue: number
  totalSales: number
  totalTaxCollected: number
  totalProfit: number
  profitMargin: number
  totalExpenses: number
}

type Metrics = {
  mtd: MetricsPeriod
  ytd: MetricsPeriod
  lifetime: MetricsPeriod
  trends: {
    revenueTrend: number
    salesTrend: number
    profitTrend: number
    expensesTrend: number
  }
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