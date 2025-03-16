'use client'

import { TransactionsList } from "@/components/transactions-list";
import { AmexTransactions } from "@/components/amex-transactions";
import { SyncButton } from '@/components/sync-button'
import { Button } from "@/components/ui/button"
import { Eye, EyeOff } from "lucide-react"
import { useState } from 'react'
import { TrainingCard } from "@/components/training-card";

export default function Home() {
  const [isBlurred, setIsBlurred] = useState(true)

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Top Section - Only Quick Actions */}
        <div className="flex justify-between mb-8">
          <div className="flex gap-2 items-center">
            <SyncButton />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsBlurred(!isBlurred)}
              title={isBlurred ? "Show Numbers" : "Hide Numbers"}
            >
              {isBlurred ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 gap-8 mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <TransactionsList />
            </div>
            <div className="space-y-8">
              <AmexTransactions />
              <TrainingCard />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
