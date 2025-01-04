import { useState } from 'react'

type SyncOptions = {
  startDate?: string
  endDate?: string
}

type SyncResult = {
  square: {
    created: number;
    skipped: number;
    error?: string;
  };
  shopify: {
    created: number;
    skipped: number;
    error?: string;
  };
}

export function useSyncTransactions() {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const syncTransactions = async (options?: SyncOptions): Promise<SyncResult> => {
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
      if (!squareResponse.ok) throw new Error(squareResult.error || 'Square sync failed')

      // Run Shopify sync
      const shopifyResponse = await fetch(
        `/api/transactions/sync/shopify${queryString ? `?${queryString}` : ''}`,
        { method: 'POST' }
      )
      const shopifyResult = await shopifyResponse.json()
      if (!shopifyResponse.ok) throw new Error(shopifyResult.error || 'Shopify sync failed')

      return {
        square: {
          created: squareResult.created || 0,
          skipped: squareResult.skipped || 0,
          error: squareResult.error
        },
        shopify: {
          created: shopifyResult.created || 0,
          skipped: shopifyResult.skipped || 0,
          error: shopifyResult.error
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sync transactions'
      setError(errorMessage)
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