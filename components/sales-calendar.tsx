'use client'

import * as React from 'react'
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"

export function SalesCalendar() {
  const [date, setDate] = React.useState<Date | undefined>(new Date())

  // Mock data - will be replaced with real data
  const salesData = {
    [new Date().toISOString()]: { amount: 526.00, count: 3 }
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
          hasSales: (date) => date.toISOString() in salesData,
        }}
        modifiersClassNames={{
          hasSales: "bg-blue-100 font-bold text-blue-900",
        }}
      />
      {date && salesData[date.toISOString()] && (
        <div className="mt-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Sales on {date.toLocaleDateString()}: ${salesData[date.toISOString()].amount}
          </p>
        </div>
      )}
    </Card>
  )
} 