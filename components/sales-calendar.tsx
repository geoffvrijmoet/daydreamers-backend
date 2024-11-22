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
      const dateKey = transaction.date.split('T')[0] // Get just the date part
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
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Sales Calendar</h2>
        <p className="text-gray-600 dark:text-gray-400">Loading calendar...</p>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Sales Calendar</h2>
        <p className="text-red-600">Error: {error.message}</p>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Sales Calendar</h2>
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        className="rounded-md border"
        modifiers={{
          hasSales: (date) => {
            const dateStr = date.toISOString().split('T')[0]
            return dateStr in salesByDate
          },
        }}
        modifiersClassNames={{
          hasSales: "bg-blue-100 font-bold text-blue-900 dark:bg-blue-900 dark:text-blue-100",
        }}
      />
      {date && salesByDate[date.toISOString().split('T')[0]] && (
        <div className="mt-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Sales on {date.toLocaleDateString()}: 
            ${salesByDate[date.toISOString().split('T')[0]].amount.toFixed(2)}
            <br />
            Number of transactions: {salesByDate[date.toISOString().split('T')[0]].count}
          </p>
        </div>
      )}
    </Card>
  )
} 