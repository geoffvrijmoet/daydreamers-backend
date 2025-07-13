'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { subDays, differenceInDays, startOfDay, endOfDay } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

export function HomeSyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [showDateOptions, setShowDateOptions] = useState(false)
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState<{
    type: 'since-last' | 'preset' | 'custom'
    days?: number
    label: string
    startDate?: Date
    endDate?: Date
  }>({ type: 'since-last', label: 'Since last sync' })
  const [error, setError] = useState<string | null>(null)
  const [lastSyncResult, setLastSyncResult] = useState<{
    square: { created: number, updated: number, skipped: number, feesUpdated?: number, feesSkipped?: number },
    shopify: { created: number, updated: number, skipped: number, feesUpdated?: number, feesSkipped?: number }
  } | null>(null)
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Load last sync date on mount
  useEffect(() => {
    async function fetchLastSyncDate() {
      try {
        const response = await fetch('/api/transactions/sync/last')
        if (response.ok) {
          const data = await response.json()
          if (data.lastSuccessfulSync) {
            const lastSync = new Date(data.lastSuccessfulSync)
            setLastSyncDate(lastSync)
            const days = differenceInDays(new Date(), lastSync)
            setSelectedTimeframe({
              type: 'since-last',
              label: days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`,
              startDate: lastSync,
              endDate: new Date()
            })
            return
          }
        }

        // If no last sync date, default to 7 days ago
        const sevenDaysAgo = subDays(new Date(), 7)
        setLastSyncDate(sevenDaysAgo)
        setSelectedTimeframe({
          type: 'since-last',
          label: '7 days',
          startDate: sevenDaysAgo,
          endDate: new Date()
        })
      } catch (error) {
        console.error('Error fetching last sync date:', error)
        // Default to 7 days ago if there's an error
        const sevenDaysAgo = subDays(new Date(), 7)
        setLastSyncDate(sevenDaysAgo)
        setSelectedTimeframe({
          type: 'since-last',
          label: '7 days',
          startDate: sevenDaysAgo,
          endDate: new Date()
        })
      }
    }

    fetchLastSyncDate()
  }, [])

  const handleSync = async () => {
    try {
      setIsSyncing(true)
      setError(null)
      
      // Calculate date range based on selected timeframe
      let startDate: Date
      let endDate: Date
      
      if (selectedTimeframe.type === 'custom' && selectedTimeframe.startDate && selectedTimeframe.endDate) {
        // Custom dates - set to Eastern time boundaries
        const easternTz = 'America/New_York'
        startDate = toZonedTime(startOfDay(selectedTimeframe.startDate), easternTz)
        endDate = toZonedTime(endOfDay(selectedTimeframe.endDate), easternTz)
      } else if (selectedTimeframe.type === 'preset' && selectedTimeframe.days !== undefined) {
        // Preset days
        endDate = new Date()
        if (selectedTimeframe.days === 0) {
          // Today only
          startDate = startOfDay(new Date())
        } else {
          // Last N days
          startDate = subDays(new Date(), selectedTimeframe.days)
        }
      } else {
        // Default to selected timeframe dates or fallback
        startDate = selectedTimeframe.startDate || lastSyncDate || subDays(new Date(), 7)
        endDate = selectedTimeframe.endDate || new Date()
      }

      // Run Square sync
      const squareResponse = await fetch('/api/transactions/sync/square', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
      })
      
      if (!squareResponse.ok) {
        const error = await squareResponse.text()
        throw new Error(error)
      }
      
      const squareResult = await squareResponse.json()

      // Run Shopify sync
      const shopifyResponse = await fetch('/api/transactions/sync/shopify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
      })
      
      if (!shopifyResponse.ok) {
        const error = await shopifyResponse.text()
        throw new Error(error)
      }
      
      const shopifyResult = await shopifyResponse.json()

      setLastSyncResult({
        square: squareResult.results,
        shopify: shopifyResult.results
      })
      
      // Close the date options dialog
      setShowDateOptions(false)
    } catch (error) {
      console.error('Sync error:', error)
      setError(error instanceof Error ? error.message : 'Failed to sync')
    } finally {
      setIsSyncing(false)
    }
  }

  const selectTimeframe = (type: 'preset' | 'custom', options: { days?: number, label: string, startDate?: Date, endDate?: Date }) => {
    setSelectedTimeframe({
      type,
      ...options
    })
    setShowDateOptions(false)
    setError(null)
  }

  const handleCustomSync = () => {
    if (!customStartDate || !customEndDate) {
      setError('Please select both start and end dates')
      return
    }
    
    const startDate = new Date(customStartDate)
    const endDate = new Date(customEndDate)
    
    if (startDate > endDate) {
      setError('Start date must be before end date')
      return
    }
    
    selectTimeframe('custom', {
      label: `${customStartDate} to ${customEndDate}`,
      startDate,
      endDate
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        <Button 
          onClick={() => handleSync()}
          disabled={isSyncing}
          className="w-full sm:w-auto"
        >
          {isSyncing ? 'Syncing...' : 'Sync Orders'}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDateOptions(true)}
          disabled={isSyncing}
          className="w-full sm:w-auto text-sm"
        >
          {selectedTimeframe.label}
        </Button>
      </div>

      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}

      {lastSyncResult && (
        <div className="text-sm space-y-1">
          <div>
            Square: {lastSyncResult.square.created} created, {lastSyncResult.square.updated} updated, {lastSyncResult.square.skipped} skipped
            {(lastSyncResult.square.feesUpdated || lastSyncResult.square.feesSkipped) && (
              <span className="text-blue-600 ml-2">
                ({lastSyncResult.square.feesUpdated || 0} fees updated)
              </span>
            )}
          </div>
          <div>
            Shopify: {lastSyncResult.shopify.created} created, {lastSyncResult.shopify.updated} updated, {lastSyncResult.shopify.skipped} skipped
            {(lastSyncResult.shopify.feesUpdated || lastSyncResult.shopify.feesSkipped) && (
              <span className="text-blue-600 ml-2">
                ({lastSyncResult.shopify.feesUpdated || 0} fees updated)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Date Options Dialog */}
      <Dialog open={showDateOptions} onOpenChange={setShowDateOptions}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select Sync Period</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={() => selectTimeframe('preset', { days: 0, label: 'Today' })}
              disabled={isSyncing}
              className="w-full justify-start"
            >
              Today
            </Button>
            <Button
              variant="outline"
              onClick={() => selectTimeframe('preset', { days: 3, label: 'Last 3 days' })}
              disabled={isSyncing}
              className="w-full justify-start"
            >
              Last 3 days
            </Button>
            <Button
              variant="outline"
              onClick={() => selectTimeframe('preset', { days: 7, label: 'Last 7 days' })}
              disabled={isSyncing}
              className="w-full justify-start"
            >
              Last 7 days
            </Button>
            <Button
              variant="outline"
              onClick={() => selectTimeframe('preset', { days: 30, label: 'Last 30 days' })}
              disabled={isSyncing}
              className="w-full justify-start"
            >
              Last 30 days
            </Button>
            
            <div className="space-y-3 pt-3 border-t">
              <h4 className="font-medium">Custom Range</h4>
              <div className="space-y-2">
                <div>
                  <label className="text-sm font-medium">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <Button
                  onClick={handleCustomSync}
                  disabled={isSyncing}
                  className="w-full"
                >
                  Sync Custom Range
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 