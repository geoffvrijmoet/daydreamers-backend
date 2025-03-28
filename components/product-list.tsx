'use client'

import { useState, useEffect } from 'react'
import { Product, CostHistoryEntry } from '@/types'
import { Card } from "@/components/ui/card"
import { calculateProfitPerUnit, getPreTaxPrice } from '@/lib/utils/pricing'
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ProductListProps = {
  products: Product[]
  onUpdate: () => void
}

type EditableFields = {
  name: string
  sku: string
  description: string
  stock: number
  minimumStock: number
  price: number
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
              ${entry.cost.toFixed(2)}/unit
            </span>
            <span className="text-gray-500">
              Qty: {entry.quantity}
            </span>
            <span className="text-gray-900 dark:text-white text-right">
              ${(entry.cost * entry.quantity).toFixed(2)}
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
    ? (product.lastPurchasePrice - product.costHistory[1].cost) / product.costHistory[1].cost * 100
    : 0

  const preTaxPrice = getPreTaxPrice(product.price)

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
  const router = useRouter()
  const [sortBy, setSortBy] = useState<'name' | 'profit' | 'stock'>('name')
  const [filterLowStock, setFilterLowStock] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingProduct, setEditingProduct] = useState<EditingProduct | null>(null)
  const [expandedProducts, setExpandedProducts] = useState<string[]>([])

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

  const toggleProductExpansion = (productId: string) => {
    setExpandedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    )
  }

  // Sort and filter products
  const sortedProducts = [...products].sort((a, b) => {
    switch (sortBy) {
      case 'profit':
        const profitA = (a.price - a.averageCost) / a.averageCost * 100
        const profitB = (b.price - b.averageCost) / b.averageCost * 100
        return profitB - profitA
      case 'stock':
        return a.stock - a.minimumStock - (b.stock - b.minimumStock)
      default:
        return a.name.localeCompare(b.name)
    }
  })

  const filteredProducts = sortedProducts
    .filter(p => showInactive || p.active !== false)
    .filter(p => !filterLowStock || p.stock <= p.minimumStock)

  // Group products by parent ID
  const groupedProducts = filteredProducts.reduce((groups, product) => {
    const squareParentId = product.platformMetadata.find(m => m.platform === 'square')?.parentId
    if (!squareParentId) {
      // Products without a parent ID get their own group
      return [...groups, [product]]
    }

    const existingGroup = groups.find(group => 
      group[0].platformMetadata.find(m => m.platform === 'square')?.parentId === squareParentId
    )

    if (existingGroup) {
      existingGroup.push(product)
    } else {
      groups.push([product])
    }
    return groups
  }, [] as Product[][])

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

      {/* Product List */}
      <div className="space-y-2">
        {groupedProducts.map((group, groupIndex) => (
          <Card key={groupIndex} className="p-4">
            {/* Parent Product Name */}
            <h3 className="font-medium mb-4">{group[0].name.split(' - ')[0]}</h3>
            
            {group.map((product, productIndex) => (
              <div 
                key={product._id}
                className={cn(
                  "py-2",
                  productIndex !== 0 && "border-t border-gray-100"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleProductExpansion(product.id)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      {expandedProducts.includes(product.id) ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </button>
                    <div>
                      <h3 className="font-medium">
                        {product.name.split(' - ')[1] || 'Default'}
                      </h3>
                      <p className="text-sm text-gray-500">SKU: {product.sku}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/products/${product._id}`)}
                    >
                      Edit Product
                    </Button>
                    <div className="text-right">
                      {product.stock === 1 ? (
                        <>
                          <p className="font-medium">${product.price?.toFixed(2)}</p>
                          <p className="text-sm text-gray-500">Stock: {product.stock}</p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium">${product.price?.toFixed(2)}</p>
                          <p className="text-sm text-gray-500">
                            Total Stock: {group.reduce((sum, p) => sum + p.stock, 0)}
                          </p>
                        </>
                      )}
                    </div>
                    {!product.active && (
                      <span className="text-sm text-gray-500">(Hidden)</span>
                    )}
                  </div>
                </div>
                
                {/* Expanded Content */}
                {expandedProducts.includes(product.id) && (
                  <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                    {/* Editable Fields */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-gray-500">Current Stock</p>
                        <div className="flex items-center gap-2">
                          {editingProduct?.id === product.id && editingProduct.field === 'stock' ? (
                            <>
                              <Input
                                type="number"
                                value={editingProduct.value as number}
                                onChange={(e) => setEditingProduct({ ...editingProduct, value: Number(e.target.value) })}
                                className="w-20"
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateField(product.id, 'stock', editingProduct.value);
                                }}
                                className="text-xs text-green-600 hover:text-green-700"
                              >
                                Save
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingProduct(null);
                                }}
                                className="text-xs text-red-600 hover:text-red-700"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="font-medium">{product.stock}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingProduct({ id: product.id, field: 'stock', value: product.stock });
                                }}
                                className="text-xs text-gray-500 hover:text-gray-600"
                              >
                                Edit
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-sm text-gray-500">Retail Price</p>
                        <div className="flex items-center gap-2">
                          {editingProduct?.id === product.id && editingProduct.field === 'price' ? (
                            <>
                              <Input
                                type="number"
                                step="0.01"
                                value={editingProduct.value as number}
                                onChange={(e) => setEditingProduct({ ...editingProduct, value: Number(e.target.value) })}
                                className="w-24"
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateField(product.id, 'price', editingProduct.value);
                                }}
                                className="text-xs text-green-600 hover:text-green-700"
                              >
                                Save
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingProduct(null);
                                }}
                                className="text-xs text-gray-500 hover:text-gray-600"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="font-medium">${product.price.toFixed(2)}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingProduct({ id: product.id, field: 'price', value: product.price });
                                }}
                                className="text-xs text-gray-500 hover:text-gray-600"
                              >
                                Edit
                              </button>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">Pre-tax: ${getPreTaxPrice(product.price).toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Cost History & Analysis */}
                    <CostHistory entries={product.costHistory} />
                    <CostAnalysis product={product} />

                    {/* Additional Info */}
                    <div className="mt-4 text-sm text-gray-500">
                      <p>
                        Profit per Unit: ${calculateProfitPerUnit(product.price, product.averageCost).toFixed(2)} • 
                        Total Investment: ${(product.averageCost * product.stock).toFixed(2)}
                      </p>
                      {product.supplier && (
                        <p className="mt-2">Supplier: {product.supplier}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
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
                products.find(p => p.id === id)?.platformMetadata.some(m => m.platform === 'square') || 
                products.find(p => p.id === id)?.platformMetadata.some(m => m.platform === 'shopify')
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