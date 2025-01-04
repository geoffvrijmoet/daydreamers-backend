'use client'

import * as React from 'react'
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import { useTransactions } from "@/lib/hooks/useTransactions"

export function SalesCalendar() {
  const [date, setDate] = React.useState<Date | undefined>(new Date())
  const { transactions, loading, error } = useTransactions()

  // Group transactions by date
  const salesByDate = React.useMemo(() => {
    return transactions.reduce((acc, transaction) => {
      const dateKey = transaction.date.split('T')[0]
      if (!acc[dateKey]) {
        acc[dateKey] = {
          amount: 0,
          count: 0
        }
      }
      acc[dateKey].amount += transaction.amount
      acc[dateKey].count += 1
      return acc
    }, {} as Record<string, { amount: number; count: number }>)
  }, [transactions])

  if (loading) {
    return (
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-glass-primary to-glass-secondary rounded-xl" />
        <div className="relative">
          <h2 className="text-lg font-medium text-primary-900 mb-4">Sales Calendar</h2>
          <div className="flex items-center justify-center h-64">
            <p className="text-primary-700">Loading calendar...</p>
          </div>
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-glass-primary to-glass-secondary rounded-xl" />
        <div className="relative">
          <h2 className="text-lg font-medium text-primary-900 mb-4">Sales Calendar</h2>
          <p className="text-red-600">Error: {typeof error === 'string' ? error : (error as Error).message}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-glass-primary to-glass-secondary rounded-xl" />
      <div className="relative">
        <h2 className="text-lg font-medium text-primary-900 mb-4">Sales Calendar</h2>
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          className="rounded-lg bg-glass-white backdrop-blur-sm border border-white/20"
          classNames={{
            months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
            month: "space-y-4",
            caption: "flex justify-center pt-1 relative items-center text-primary-900",
            caption_label: "text-sm font-medium",
            nav: "space-x-1 flex items-center",
            nav_button: "glass-button h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 rounded-lg",
            table: "w-full border-collapse space-y-1",
            head_row: "flex",
            head_cell: "text-primary-600 rounded-md w-9 font-normal text-[0.8rem]",
            row: "flex w-full mt-2",
            cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-slate-100/50 [&:has([aria-selected])]:bg-slate-100",
            day: "glass-button h-9 w-9 p-0 font-normal rounded-lg",
            day_range_end: "day-range-end",
            day_selected: "bg-primary-200/50 text-primary-900 hover:bg-primary-200/75",
            day_today: "bg-secondary-200/50 text-secondary-900",
            day_outside: "opacity-50",
            day_disabled: "text-slate-500 opacity-50",
            day_hidden: "invisible",
          }}
          modifiers={{
            hasSales: (date) => {
              const dateStr = date.toISOString().split('T')[0]
              return dateStr in salesByDate
            },
          }}
          modifiersClassNames={{
            hasSales: "bg-primary-100/50 font-bold text-primary-900",
          }}
        />
        {date && salesByDate[date.toISOString().split('T')[0]] && (
          <div className="mt-4 p-4 bg-glass-white backdrop-blur-sm rounded-lg border border-white/20">
            <h3 className="text-sm font-medium text-primary-900 mb-2">
              Sales on {date.toLocaleDateString()}
            </h3>
            <div className="space-y-1">
              <p className="text-sm text-primary-700">
                Total Sales: ${salesByDate[date.toISOString().split('T')[0]].amount.toFixed(2)}
              </p>
              <p className="text-sm text-primary-700">
                Number of transactions: {salesByDate[date.toISOString().split('T')[0]].count}
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
} 