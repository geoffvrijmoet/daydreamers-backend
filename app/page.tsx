import { Card } from "@/components/ui/card";
import { SalesCalendar } from "@/components/sales-calendar";
import { TransactionsList } from "@/components/transactions-list";
// comment
export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Daydreamers Pet Supply Dashboard
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Track your sales, purchases, and inventory
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Sales (MTD)</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">$12,426</p>
            <p className="mt-2 text-sm text-green-600">↑ 12% from last month</p>
          </Card>
          
          <Card className="p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Purchases (MTD)</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">$8,124</p>
            <p className="mt-2 text-sm text-red-600">↑ 8% from last month</p>
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Profit Margin</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">34.6%</p>
            <p className="mt-2 text-sm text-green-600">↑ 2% from last month</p>
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Low Stock Items</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">12</p>
            <p className="mt-2 text-sm text-yellow-600">Needs attention</p>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-4 mb-8">
          <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700">
            Add Sale
          </button>
          <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700">
            Add Purchase
          </button>
          <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700">
            Update Inventory
          </button>
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <SalesCalendar />
          <TransactionsList />
        </div>
      </div>
    </div>
  );
}
