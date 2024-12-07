'use client'

import { Card } from "@/components/ui/card";
import { TransactionsList } from "@/components/transactions-list";
import { AmexTransactions } from "@/components/amex-transactions";
import { ManualTransactionForm } from '@/components/manual-transaction-form'
import { PurchaseForm } from '@/components/purchase-form'
import { useMetrics } from '@/lib/hooks/useMetrics'
import { SyncButton } from '@/components/sync-button'

export default function Home() {
  const { metrics, loading } = useMetrics()

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Top Section */}
        <div className="flex justify-between mb-8">
          {/* Quick Actions */}
          <div className="flex flex-col gap-2">
            <PurchaseForm />
            <ManualTransactionForm />
            <SyncButton />
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
                  <p className="text-lg">
                    {loading ? '...' : `$${metrics?.mtd.totalRevenue.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    MTD {loading ? '' : `${metrics?.trends.revenueTrend > 0 ? '↑' : '↓'} ${Math.abs(metrics?.trends.revenueTrend || 0).toFixed(1)}%`}
                  </p>
                </div>
                <div>
                  <p className="text-sm">
                    {loading ? '...' : `$${metrics?.ytd.totalRevenue.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">YTD</p>
                </div>
                <div>
                  <p className="text-sm">
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
                  <p className="text-lg">
                    {loading ? '...' : `$${metrics?.mtd.totalSales.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    MTD (Tax: ${loading ? '...' : metrics?.mtd.totalTaxCollected.toFixed(2)})
                  </p>
                </div>
                <div>
                  <p className="text-sm">
                    {loading ? '...' : `$${metrics?.ytd.totalSales.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    YTD (Tax: ${loading ? '...' : metrics?.ytd.totalTaxCollected.toFixed(2)})
                  </p>
                </div>
                <div>
                  <p className="text-sm">
                    {loading ? '...' : `$${metrics?.lifetime.totalSales.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    Lifetime (Tax: ${loading ? '...' : metrics?.lifetime.totalTaxCollected.toFixed(2)})
                  </p>
                </div>
              </div>
            </Card>

            <Card className="w-52">
              <h3 className="text-xs mb-3">Profit</h3>
              <div className="space-y-2">
                <div>
                  <p className="text-lg">
                    {loading ? '...' : `$${metrics?.mtd.totalProfit.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    MTD ({loading ? '...' : `${metrics?.mtd.profitMargin.toFixed(1)}%`})
                  </p>
                </div>
                <div>
                  <p className="text-sm">
                    {loading ? '...' : `$${metrics?.ytd.totalProfit.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    YTD ({loading ? '...' : `${metrics?.ytd.profitMargin.toFixed(1)}%`})
                  </p>
                </div>
                <div>
                  <p className="text-sm">
                    {loading ? '...' : `$${metrics?.lifetime.totalProfit.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    Lifetime ({loading ? '...' : `${metrics?.lifetime.profitMargin.toFixed(1)}%`})
                  </p>
                </div>
              </div>
            </Card>

            <Card className="w-52">
              <h3 className="text-xs mb-3">Expenses</h3>
              <div className="space-y-2">
                <div>
                  <p className="text-lg">
                    {loading ? '...' : `$${metrics?.mtd.totalExpenses.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    MTD {loading ? '' : `${metrics?.trends.expensesTrend > 0 ? '↑' : '↓'} ${Math.abs(metrics?.trends.expensesTrend || 0).toFixed(1)}%`}
                  </p>
                </div>
                <div>
                  <p className="text-sm">
                    {loading ? '...' : `$${metrics?.ytd.totalExpenses.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-600">YTD</p>
                </div>
                <div>
                  <p className="text-sm">
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
