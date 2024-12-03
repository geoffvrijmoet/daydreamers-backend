import { useState } from 'react'

type SyncOptions = {
  startDate?: string
  endDate?: string
}

export function useSyncTransactions() {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const syncTransactions = async (options?: SyncOptions) => {
    try {
      setSyncing(true)
      setError(null)

      const queryParams = new URLSearchParams()
      if (options?.startDate) queryParams.set('startDate', options.startDate)
      if (options?.endDate) queryParams.set('endDate', options.endDate)
      const queryString = queryParams.toString()

      // Run Square sync
      const squareResponse = await fetch(
        `/api/transactions/sync/square${queryString ? `?${queryString}` : ''}`, 
        { method: 'POST' }
      )
      const squareResult = await squareResponse.json()
      if (!squareResponse.ok) throw new Error(squareResult.error)

      // Run Shopify sync
      const shopifyResponse = await fetch(
        `/api/transactions/sync/shopify${queryString ? `?${queryString}` : ''}`,
        { method: 'POST' }
      )
      const shopifyResult = await shopifyResponse.json()
      if (!shopifyResponse.ok) throw new Error(shopifyResult.error)

      return {
        square: squareResult,
        shopify: shopifyResult
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync transactions')
      throw err
    } finally {
      setSyncing(false)
    }
  }

  return {
    syncTransactions,
    syncing,
    error
  }
} 