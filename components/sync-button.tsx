'use client'

import { useState, useEffect } from 'react'
import { startOfDay, endOfDay, format } from 'date-fns'
import { useSyncTransactions } from '@/lib/hooks/useSyncTransactions'
import { Button } from './ui/button'
import { Calendar } from './ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const LAST_SYNC_DATE_KEY = 'lastSyncEndDate'

export function SyncButton() {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{
    square: { created: number; skipped: number };
    shopify: { created: number; skipped: number };
  } | null>(null);
  const { syncTransactions, syncing } = useSyncTransactions();

  // Load last sync date on mount
  useEffect(() => {
    async function fetchLastSyncDate() {
      try {
        // Set end date to today by default
        setEndDate(new Date())

        // Try to get the last sync date from the database
        const response = await fetch('/api/transactions/sync/last')
        if (response.ok) {
          const data = await response.json()
          if (data.lastSuccessfulSync) {
            setStartDate(new Date(data.lastSuccessfulSync))
            return
          }
        }

        // Fall back to localStorage if database fetch fails
        const lastSyncDate = localStorage.getItem(LAST_SYNC_DATE_KEY)
        if (lastSyncDate) {
          setStartDate(new Date(lastSyncDate))
        }
      } catch (error) {
        console.error('Error fetching last sync date:', error)
        // Fall back to localStorage
        const lastSyncDate = localStorage.getItem(LAST_SYNC_DATE_KEY)
        if (lastSyncDate) {
          setStartDate(new Date(lastSyncDate))
        }
      }
    }

    fetchLastSyncDate()
  }, [])

  const handleSync = async () => {
    if (!startDate || !endDate) {
      setSyncError('Please select both start and end dates');
      return;
    }

    try {
      const result = await syncTransactions({
        startDate: startOfDay(startDate).toISOString(),
        endDate: endOfDay(endDate).toISOString()
      });

      // Store the end date in localStorage as backup
      localStorage.setItem(LAST_SYNC_DATE_KEY, endDate.toISOString())

      setLastSyncResult({
        square: {
          created: result.square.created || 0,
          skipped: result.square.skipped || 0
        },
        shopify: {
          created: result.shopify.created || 0,
          skipped: result.shopify.skipped || 0
        }
      });
      
      if (result.square.error || result.shopify.error) {
        setSyncError(result.square.error || result.shopify.error || 'Sync partially failed');
      } else {
        setSyncError(null);
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to sync transactions');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-left font-normal w-[140px]",
                !startDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, "MMM d, yyyy") : <span>Start date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={setStartDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-left font-normal w-[140px]",
                !endDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? format(endDate, "MMM d, yyyy") : <span>End date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={setEndDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Button 
          onClick={handleSync}
          disabled={syncing || !startDate || !endDate}
          className="flex-1"
        >
          {syncing ? 'Syncing...' : 'Sync Transactions'}
        </Button>
      </div>

      {syncError && (
        <p className="text-sm text-red-600">
          {syncError}
        </p>
      )}

      {lastSyncResult && (
        <div className="text-xs space-y-1">
          <p>Square: Created {lastSyncResult.square.created} transactions</p>
          <p>Shopify: Created {lastSyncResult.shopify.created} transactions</p>
        </div>
      )}
    </div>
  );
} 