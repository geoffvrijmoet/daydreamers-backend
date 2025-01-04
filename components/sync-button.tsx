'use client'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { useSyncTransactions } from '@/lib/hooks/useSyncTransactions'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { CalendarIcon } from 'lucide-react'
import { startOfDay, endOfDay } from 'date-fns'

interface SyncResult {
  square: {
    details: Array<{
      action: string;
      id: string;
    }>;
  };
  shopify: {
    details: Array<{
      action: string;
      id: string;
    }>;
  };
}

export function SyncButton() {
  const { syncTransactions, syncing, error } = useSyncTransactions()
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null)
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()

  const handleSync = async () => {
    try {
      const result = await syncTransactions({
        startDate: startDate ? startOfDay(startDate).toISOString() : undefined,
        endDate: endDate ? endOfDay(endDate).toISOString() : undefined
      })
      setLastSyncResult(result)
    } catch (err) {
      console.error('Sync failed:', err)
    }
  }

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

      {error && (
        <p className="text-sm text-red-600">
          {error}
        </p>
      )}

      {lastSyncResult && (
        <div className="text-xs space-y-1">
          <p>Square: Created {lastSyncResult.square.details.filter((d) => d.action === 'created').length} transactions</p>
          <p>Shopify: Created {lastSyncResult.shopify.details.filter((d) => d.action === 'created').length} transactions</p>
        </div>
      )}
    </div>
  )
} 