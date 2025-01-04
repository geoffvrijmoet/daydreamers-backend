'use client'

import { useState, useEffect } from 'react'
import { Product, CostHistoryEntry } from '@/types'
import { Card } from "@/components/ui/card"
import { calculateProfitMargin, calculateProfitPerUnit, getPreTaxPrice } from '@/lib/utils/pricing'

type ProductListProps = {
  products: Product[]
  onUpdate: () => void
}

function CostHistory({ entries }: { entries: CostHistoryEntry[] }) {
  const [isExpanded, setIsExpanded] = useState(false)

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const recentEntries = sortedEntries.slice(0, isExpanded ? undefined : 3)

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Cost History
      </h4>
      <div className="space-y-2">
        {recentEntries.map((entry, index) => (
          <div 
            key={`${entry.date}-${index}`}
            className="text-sm grid grid-cols-4 gap-2"
          >
            <span className="text-gray-500">
              {new Date(entry.date).toLocaleDateString()}
            </span>
            <span className="text-gray-900 dark:text-white">
              ${entry.unitPrice.toFixed(2)}/unit
            </span>
            <span className="text-gray-500">
              Qty: {entry.quantity}
            </span>
            <span className="text-gray-900 dark:text-white text-right">
              ${entry.totalPrice.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      {entries.length > 3 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mt-2"
        >
          {isExpanded ? 'Show Less' : `Show ${entries.length - 3} More Entries`}
        </button>
      )}
    </div>
  )
}

function CostAnalysis({ product }: { product: Product }) {
  const averageCost = product.costHistory.length > 0
    ? product.totalSpent / product.totalPurchased
    : product.lastPurchasePrice

  const costTrend = product.costHistory.length >= 2
    ? (product.lastPurchasePrice - product.costHistory[1].unitPrice) / product.costHistory[1].unitPrice * 100
    : 0

  const preTaxPrice = getPreTaxPrice(product.retailPrice)

  return (
    <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Average Cost</p>
          <p className="text-lg font-medium text-gray-900 dark:text-white">
            ${averageCost.toFixed(2)}
          </p>
          {costTrend !== 0 && (
            <p className={`text-sm ${costTrend > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {costTrend > 0 ? '↑' : '↓'} {Math.abs(costTrend).toFixed(1)}% from previous
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Pre-tax price: ${preTaxPrice.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Investment</p>
          <p className="text-lg font-medium text-gray-900 dark:text-white">
            ${product.totalSpent.toFixed(2)}
          </p>
          <p className="text-sm text-gray-500">
            {product.totalPurchased} units total
          </p>
        </div>
      </div>
    </div>
  )
}

export function ProductList({ products, onUpdate }: ProductListProps) {
  const [sortBy, setSortBy] = useState<'name' | 'profit' | 'stock'>('name')
  const [filterLowStock, setFilterLowStock] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    console.log('ProductList received products:', products)
  }, [products])

  async function handleBulkDelete() {
    try {
      console.log('Deleting products:', selectedProducts)
      const response = await fetch('/api/products/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: selectedProducts })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to delete products')
      }

      const result = await response.json()
      console.log('Delete result:', result)

      onUpdate() // Refresh product list
      setSelectedProducts([])
      setShowBulkDelete(false)
    } catch (err) {
      console.error('Bulk delete error:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete products')
    }
  }

  // Sort and filter products
  const sortedProducts = [...products].sort((a, b) => {
    switch (sortBy) {
      case 'profit':
        const profitA = (a.retailPrice - a.averageCost) / a.averageCost * 100
        const profitB = (b.retailPrice - b.averageCost) / b.averageCost * 100
        return profitB - profitA
      case 'stock':
        return a.currentStock - a.minimumStock - (b.currentStock - b.minimumStock)
      default:
        return a.name.localeCompare(b.name)
    }
  })

  const filteredProducts = sortedProducts
    .filter(p => showInactive || p.active !== false)
    .filter(p => !filterLowStock || p.currentStock <= p.minimumStock)

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Select all visible (filtered) products
      setSelectedProducts(filteredProducts.map(p => p.id))
    } else {
      // Deselect all
      setSelectedProducts([])
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-red-600">{error}</p>
        </div>
      )}
      {/* Controls */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-4">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'profit' | 'stock')}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="name">Sort by Name</option>
            <option value="profit">Sort by Profit Margin</option>
            <option value="stock">Sort by Stock Level</option>
          </select>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filterLowStock}
                onChange={(e) => setFilterLowStock(e.target.checked)}
                className="rounded border-gray-300 text-primary-400 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Show Low Stock Only</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300 text-primary-400 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Show Hidden Products</span>
            </label>
          </div>
        </div>
      </div>

      {/* Select All and Bulk Delete */}
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
            onChange={(e) => handleSelectAll(e.target.checked)}
            className="rounded border-gray-300 text-primary-400 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Select All ({filteredProducts.length} products)
          </span>
        </label>
        {selectedProducts.length > 0 && (
          <button
            onClick={() => setShowBulkDelete(true)}
            className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-md"
          >
            Delete Selected ({selectedProducts.length})
          </button>
        )}
      </div>

      {/* Product Cards */}
      <div className="space-y-4">
        {filteredProducts.map(product => (
          <Card key={product.id} className="p-4">
            <div className="flex items-start gap-4">
              <input
                type="checkbox"
                checked={selectedProducts.includes(product.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedProducts(prev => [...prev, product.id])
                  } else {
                    setSelectedProducts(prev => prev.filter(id => id !== product.id))
                  }
                }}
                className="mt-1 rounded border-gray-300"
              />
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    {product.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    SKU: {product.sku}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Stock: {product.currentStock} 
                    {product.currentStock <= product.minimumStock && (
                      <span className="ml-2 text-xs text-red-600">Low Stock</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Cost Basis & Profit Information */}
              <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Cost Basis</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    ${product.averageCost.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Retail Price (with tax)</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    ${product.retailPrice.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Pre-tax: ${getPreTaxPrice(product.retailPrice).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Profit Margin</p>
                  <p className={`font-medium ${
                    calculateProfitMargin(product.retailPrice, product.averageCost) >= 30
                      ? 'text-green-600'
                      : 'text-yellow-600'
                  }`}>
                    {calculateProfitMargin(product.retailPrice, product.averageCost).toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Cost History & Analysis */}
              <CostHistory entries={product.costHistory} />
              <CostAnalysis product={product} />

              {/* Additional Info */}
              <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                <p>
                  Profit per Unit: ${calculateProfitPerUnit(product.retailPrice, product.averageCost).toFixed(2)} • 
                  Total Investment: ${(product.averageCost * product.currentStock).toFixed(2)}
                </p>
                {product.supplier && (
                  <p className="mt-1">Supplier: {product.supplier}</p>
                )}
              </div>

              {/* Add inactive indicator */}
              {!product.active && (
                <div className="mt-2 text-sm text-gray-500">
                  This product is hidden
                </div>
              )}

              {/* Delete Button */}
              <div className="mt-4 flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setSelectedProducts([product.id])
                    setShowBulkDelete(true)
                  }}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Delete {selectedProducts.length} Products?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              This action cannot be undone. The selected products will be permanently deleted from your database.
              {selectedProducts.some(id => 
                products.find(p => p.id === id)?.squareId || 
                products.find(p => p.id === id)?.shopifyId
              ) && (
                <span className="block mt-2 text-red-600">
                  Warning: Some selected products exist in Square or Shopify. Delete them there first.
                </span>
              )}
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setShowBulkDelete(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-md"
              >
                Delete Selected Products
              </button>
            </div>
          </div>
        </div>
      )}

      {filteredProducts.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No products found
        </p>
      )}
    </div>
  )
} 