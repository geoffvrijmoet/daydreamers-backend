'use client'

import { Card } from "@/components/ui/card";
import { TransactionsList } from "@/components/transactions-list";
import { AmexTransactions } from "@/components/amex-transactions";
import { useMetrics } from '@/lib/hooks/useMetrics'
import { SyncButton } from '@/components/sync-button'
import { Button } from "@/components/ui/button"
import { Eye, EyeOff } from "lucide-react"
import { useState } from 'react'

export default function Home() {
  const { metrics, loading } = useMetrics()
  const [isBlurred, setIsBlurred] = useState(true)

  const blurClass = isBlurred ? 'blur select-none' : ''

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Top Section */}
        <div className="flex justify-between mb-8">
          {/* Quick Actions */}
          <div className="flex flex-col gap-2">
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
            <button className="button">
              Update Inventory
            </button>
          </div>

          {/* Metrics */}
          <div className="flex gap-4">
            <Card className="w-52">
              <h3 className="text-xs mb-3">Revenue</h3>
              <div className="space-y-2">
                <div>
                  <p className={`text-lg ${blurClass}`}>
                    {loading ? '...' : `$${metrics?.mtd.totalRevenue.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    MTD {loading ? '' : <span className={blurClass}>{`${(metrics?.trends?.revenueTrend ?? 0) > 0 ? '↑' : '↓'} ${Math.abs(metrics?.trends?.revenueTrend ?? 0).toFixed(1)}%`}</span>}
                  </p>
                </div>
                <div>
                  <p className={`text-sm ${blurClass}`}>
                    {loading ? '...' : `$${metrics?.ytd.totalRevenue.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">YTD</p>
                </div>
                <div>
                  <p className={`text-sm ${blurClass}`}>
                    {loading ? '...' : `$${metrics?.lifetime.totalRevenue.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">Lifetime</p>
                </div>
              </div>
            </Card>
            
            <Card className="w-52">
              <h3 className="text-xs mb-3">Sales</h3>
              <div className="space-y-2">
                <div>
                  <p className={`text-lg ${blurClass}`}>
                    {loading ? '...' : `$${metrics?.mtd.totalSales.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    MTD (Tax: <span className={blurClass}>${loading ? '...' : metrics?.mtd.totalTaxCollected.toFixed(2)}</span>)
                  </p>
                </div>
                <div>
                  <p className={`text-sm ${blurClass}`}>
                    {loading ? '...' : `$${metrics?.ytd.totalSales.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    YTD (Tax: <span className={blurClass}>${loading ? '...' : metrics?.ytd.totalTaxCollected.toFixed(2)}</span>)
                  </p>
                </div>
                <div>
                  <p className={`text-sm ${blurClass}`}>
                    {loading ? '...' : `$${metrics?.lifetime.totalSales.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    Lifetime (Tax: <span className={blurClass}>${loading ? '...' : metrics?.lifetime.totalTaxCollected.toFixed(2)}</span>)
                  </p>
                </div>
              </div>
            </Card>

            <Card className="w-52">
              <h3 className="text-xs mb-3">Profit</h3>
              <div className="space-y-2">
                <div>
                  <p className={`text-lg ${blurClass}`}>
                    {loading ? '...' : `$${metrics?.mtd.totalProfit.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    MTD (<span className={blurClass}>{loading ? '...' : `${metrics?.mtd.profitMargin.toFixed(1)}%`}</span>)
                  </p>
                </div>
                <div>
                  <p className={`text-sm ${blurClass}`}>
                    {loading ? '...' : `$${metrics?.ytd.totalProfit.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    YTD (<span className={blurClass}>{loading ? '...' : `${metrics?.ytd.profitMargin.toFixed(1)}%`}</span>)
                  </p>
                </div>
                <div>
                  <p className={`text-sm ${blurClass}`}>
                    {loading ? '...' : `$${metrics?.lifetime.totalProfit.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    Lifetime (<span className={blurClass}>{loading ? '...' : `${metrics?.lifetime.profitMargin.toFixed(1)}%`}</span>)
                  </p>
                </div>
              </div>
            </Card>

            <Card className="w-52">
              <h3 className="text-xs mb-3">Expenses</h3>
              <div className="space-y-2">
                <div>
                  <p className={`text-lg ${blurClass}`}>
                    {loading ? '...' : `$${metrics?.mtd.totalExpenses.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    MTD {loading ? '' : <span className={blurClass}>{`${(metrics?.trends?.expensesTrend ?? 0) > 0 ? '↑' : '↓'} ${Math.abs(metrics?.trends?.expensesTrend ?? 0).toFixed(1)}%`}</span>}
                  </p>
                </div>
                <div>
                  <p className={`text-sm ${blurClass}`}>
                    {loading ? '...' : `$${metrics?.ytd.totalExpenses.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">YTD</p>
                </div>
                <div>
                  <p className={`text-sm ${blurClass}`}>
                    {loading ? '...' : `$${metrics?.lifetime.totalExpenses.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">Lifetime</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <TransactionsList />
          </div>
          <div>
            <AmexTransactions />
          </div>
        </div>
      </div>
    </div>
  );
}
