'use client'

import { useState, useEffect } from 'react'
import { Product, CostHistoryEntry } from '@/types'
import { Card } from "@/components/ui/card"
import { calculateProfitPerUnit, getPreTaxPrice } from '@/lib/utils/pricing'
import { Input } from "@/components/ui/input"

type ProductListProps = {
  products: Product[]
  onUpdate: () => void
}

type EditableFields = {
  name: string
  sku: string
  description: string
  currentStock: number
  minimumStock: number
  retailPrice: number
  wholesalePrice: number
  lastPurchasePrice: number
  supplier: string
  category: string
  active: boolean
}

type EditingProduct = {
  id: string
  field: keyof EditableFields
  value: EditableFields[keyof EditableFields]
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
  const [editingProduct, setEditingProduct] = useState<EditingProduct | null>(null)
  const [editingPrice, setEditingPrice] = useState<number | null>(null)

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

  const handleUpdatePrice = async (productId: string) => {
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lastPurchasePrice: editingPrice,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update price')
      }

      setEditingPrice(null)
      onUpdate() // Refresh the product list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update price')
    }
  }

  const handleUpdateField = async (productId: string, field: keyof EditableFields, value: EditableFields[keyof EditableFields]) => {
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          [field]: value,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update product')
      }

      setEditingProduct(null)
      onUpdate() // Refresh the product list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update product')
    }
  }

  const startEditing = (product: Product, field: keyof EditableFields) => {
    setEditingProduct({
      id: product.id,
      field,
      value: product[field] as EditableFields[keyof EditableFields]
    })
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

  // Group products by Square parent ID
  const groupedProducts = filteredProducts.reduce((groups, product) => {
    if (!product.squareParentId) {
      // Products without a parent ID get their own card
      return [...groups, [product]]
    }

    const existingGroup = groups.find(group => 
      group[0].squareParentId === product.squareParentId
    )

    if (existingGroup) {
      existingGroup.push(product)
      return groups
    }

    return [...groups, [product]]
  }, [] as Product[][])

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
        {groupedProducts.map(group => (
          <Card key={group[0].id} className="p-4">
            <div className="space-y-4">
              {group.map(product => (
                <div key={product.id} className="space-y-4">
                  {/* Product Name */}
                  <div className="flex items-center justify-between">
                    {editingProduct?.id === product.id && editingProduct.field === 'name' ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editingProduct.value as string}
                          onChange={(e) => setEditingProduct({ ...editingProduct, value: e.target.value })}
                          className="w-64"
                        />
                        <button
                          onClick={() => handleUpdateField(product.id, 'name', editingProduct.value)}
                          className="text-xs text-green-600 hover:text-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingProduct(null)}
                          className="text-xs text-gray-500 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-medium">{product.name}</h3>
                        <button
                          onClick={() => startEditing(product, 'name')}
                          className="text-xs text-gray-500 hover:text-gray-600"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>

                  {/* SKU */}
                  <div>
                    {editingProduct?.id === product.id && editingProduct.field === 'sku' ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editingProduct.value as string}
                          onChange={(e) => setEditingProduct({ ...editingProduct, value: e.target.value })}
                          className="w-48"
                        />
                        <button
                          onClick={() => handleUpdateField(product.id, 'sku', editingProduct.value)}
                          className="text-xs text-green-600 hover:text-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingProduct(null)}
                          className="text-xs text-gray-500 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-500">SKU: {product.sku}</p>
                        <button
                          onClick={() => startEditing(product, 'sku')}
                          className="text-xs text-gray-500 hover:text-gray-600"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Stock Information */}
                  <div className="grid grid-cols-3 gap-4">
                    {/* Current Stock */}
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Current Stock</p>
                      {editingProduct?.id === product.id && editingProduct.field === 'currentStock' ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={editingProduct.value as number}
                            onChange={(e) => setEditingProduct({ ...editingProduct, value: Number(e.target.value) })}
                            className="w-24"
                          />
                          <button
                            onClick={() => handleUpdateField(product.id, 'currentStock', editingProduct.value)}
                            className="text-xs text-green-600 hover:text-green-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingProduct(null)}
                            className="text-xs text-gray-500 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-white">{product.currentStock}</p>
                          <button
                            onClick={() => startEditing(product, 'currentStock')}
                            className="text-xs text-gray-500 hover:text-gray-600"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Retail Price */}
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Retail Price (with tax)</p>
                      {editingProduct?.id === product.id && editingProduct.field === 'retailPrice' ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={editingProduct.value as number}
                            onChange={(e) => setEditingProduct({ ...editingProduct, value: Number(e.target.value) })}
                            className="w-24"
                          />
                          <button
                            onClick={() => handleUpdateField(product.id, 'retailPrice', editingProduct.value)}
                            className="text-xs text-green-600 hover:text-green-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingProduct(null)}
                            className="text-xs text-gray-500 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-white">${product.retailPrice.toFixed(2)}</p>
                          <button
                            onClick={() => startEditing(product, 'retailPrice')}
                            className="text-xs text-gray-500 hover:text-gray-600"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-gray-500">Pre-tax: ${getPreTaxPrice(product.retailPrice).toFixed(2)}</p>
                    </div>

                    {/* Last Purchase Price */}
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Last Purchase Price</p>
                      {editingProduct?.id === product.id && editingProduct.field === 'lastPurchasePrice' ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={editingProduct.value as number}
                            onChange={(e) => setEditingProduct({ ...editingProduct, value: Number(e.target.value) })}
                            className="w-24"
                          />
                          <button
                            onClick={() => handleUpdateField(product.id, 'lastPurchasePrice', editingProduct.value)}
                            className="text-xs text-green-600 hover:text-green-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingProduct(null)}
                            className="text-xs text-gray-500 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-white">${product.lastPurchasePrice.toFixed(2)}</p>
                          <button
                            onClick={() => startEditing(product, 'lastPurchasePrice')}
                            className="text-xs text-gray-500 hover:text-gray-600"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Supplier */}
                  <div>
                    {editingProduct?.id === product.id && editingProduct.field === 'supplier' ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editingProduct.value as string}
                          onChange={(e) => setEditingProduct({ ...editingProduct, value: e.target.value })}
                          className="w-48"
                        />
                        <button
                          onClick={() => handleUpdateField(product.id, 'supplier', editingProduct.value)}
                          className="text-xs text-green-600 hover:text-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingProduct(null)}
                          className="text-xs text-gray-500 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-500">Supplier: {product.supplier || 'None'}</p>
                        <button
                          onClick={() => startEditing(product, 'supplier')}
                          className="text-xs text-gray-500 hover:text-gray-600"
                        >
                          Edit
                        </button>
                      </div>
                    )}
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
                  </div>

                  {/* Add inactive indicator */}
                  {!product.active && (
                    <div className="mt-2 text-sm text-gray-500">
                      This product is hidden
                    </div>
                  )}
                </div>
              ))}

              {/* Delete Button */}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => {
                    setSelectedProducts(group.map(p => p.id))
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