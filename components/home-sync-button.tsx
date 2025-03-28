'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChevronDown } from 'lucide-react'
import { subDays } from 'date-fns'

export function HomeSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lastSyncResult, setLastSyncResult] = useState<{created: number, updated: number, skipped: number} | null>(null)

  // Load last sync date on mount
  useEffect(() => {
    async function fetchLastSyncDate() {
      try {
        // Set end date to now by default
        setEndDate(new Date().toISOString().slice(0, 16))

        // Try to get the last sync date from the database
        const response = await fetch('/api/transactions/sync/last')
        if (response.ok) {
          const data = await response.json()
          if (data.lastSuccessfulSync) {
            setStartDate(new Date(data.lastSuccessfulSync).toISOString().slice(0, 16))
            return
          }
        }

        // If no last sync date, default to 7 days ago
        setStartDate(subDays(new Date(), 7).toISOString().slice(0, 16))
      } catch (error) {
        console.error('Error fetching last sync date:', error)
        // Default to 7 days ago if there's an error
        setStartDate(subDays(new Date(), 7).toISOString().slice(0, 16))
      }
    }

    fetchLastSyncDate()
  }, [])

  const handleSync = async () => {
    try {
      setIsSyncing(true)
      setError(null)
      
      const response = await fetch('/api/transactions/sync/square', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
        }),
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }
      
      const data = await response.json()
      setLastSyncResult(data.results)
    } catch (error) {
      console.error('Sync error:', error)
      setError(error instanceof Error ? error.message : 'Failed to sync')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex">
        <Button 
          onClick={handleSync}
          disabled={isSyncing || !startDate || !endDate}
          className="rounded-r-none"
        >
          {isSyncing ? 'Syncing...' : 'Sync Square'}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="rounded-l-none border-l-0"
              disabled={isSyncing}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="end">
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Start Date</label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 border rounded-md"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">End Date</label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}

      {lastSyncResult && (
        <div className="text-sm">
          Last sync results: {lastSyncResult.created} created, {lastSyncResult.updated} updated, {lastSyncResult.skipped} skipped
        </div>
      )}
    </div>
  )
} 