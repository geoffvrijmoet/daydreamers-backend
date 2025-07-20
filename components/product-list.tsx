'use client'

import { useState, useEffect } from 'react'
import { Product } from '@/types'
import { Card } from "@/components/ui/card"
import { calculateProfitPerUnit } from '@/lib/utils/pricing'
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronRight, Package, DollarSign, AlertTriangle } from 'lucide-react'
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



export function ProductList({ products, onUpdate }: ProductListProps) {
  const router = useRouter()
  const [sortBy, setSortBy] = useState<'name' | 'profit' | 'stock'>('name')
  const [filterLowStock, setFilterLowStock] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingProduct, setEditingProduct] = useState<EditingProduct | null>(null)
  const [expandedProductGroups, setExpandedProductGroups] = useState<string[]>([])

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

  const toggleProductGroupExpansion = (baseProductName: string) => {
    setExpandedProductGroups(prev => 
      prev.includes(baseProductName) 
        ? prev.filter(name => name !== baseProductName)
        : [...prev, baseProductName]
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

  // Group products by baseProductName
  const groupedProducts = filteredProducts.reduce((groups, product) => {
    const baseName = product.baseProductName
    const existingGroup = groups.find(group => group.baseProductName === baseName)
    
    if (existingGroup) {
      existingGroup.variants.push(product)
    } else {
      groups.push({
        baseProductName: baseName,
        variants: [product]
      })
    }
    return groups
  }, [] as Array<{ baseProductName: string; variants: Product[] }>)

  // Calculate group-level stats
  const productGroups = groupedProducts.map(group => {
    const totalStock = group.variants.reduce((sum, p) => sum + p.stock, 0)
    const totalValue = group.variants.reduce((sum, p) => sum + (p.price * p.stock), 0)
    const averagePrice = group.variants.reduce((sum, p) => sum + p.price, 0) / group.variants.length
    const hasLowStock = group.variants.some(p => p.stock <= p.minimumStock)
    const hasInactive = group.variants.some(p => !p.active)
    
    return {
      ...group,
      totalStock,
      totalValue,
      averagePrice,
      hasLowStock,
      hasInactive
    }
  })

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">{error}</p>
        </div>
      )}
      
      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
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

      {/* Product Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {productGroups.map((group) => {
          const isExpanded = expandedProductGroups.includes(group.baseProductName)
          
          return (
            <Card 
              key={group.baseProductName}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-lg",
                isExpanded && "ring-2 ring-blue-500 shadow-lg"
              )}
              onClick={() => toggleProductGroupExpansion(group.baseProductName)}
            >
              {/* Card Header */}
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {group.baseProductName}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Package className="h-4 w-4" />
                      <span>{group.variants.length} variant{group.variants.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.hasLowStock && (
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    )}
                    {group.hasInactive && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Hidden</span>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Package className="h-4 w-4 text-blue-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Stock</span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {group.totalStock}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Value</span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      ${group.totalValue.toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* Average Price */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Avg. Price:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${group.averagePrice.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Expanded Variants */}
              {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  <div className="p-6 space-y-4">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                      Variants
                    </h4>
                    {group.variants.map((variant) => (
                      <div 
                        key={variant._id}
                        className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h5 className="font-medium text-gray-900 dark:text-white">
                              {variant.variantName || 'Default'}
                            </h5>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              SKU: {variant.sku}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-gray-900 dark:text-white">
                              ${variant.price?.toFixed(2) || '0.00'}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Stock: {variant.stock}
                            </p>
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/products/${variant._id}`)}
                            className="text-xs"
                          >
                            Edit
                          </Button>
                          {variant.stock <= variant.minimumStock && (
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                              Low Stock
                            </span>
                          )}
                          {!variant.active && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                              Hidden
                            </span>
                          )}
                        </div>

                        {/* Quick Edit Fields */}
                        <div className="grid grid-cols-2 gap-4 mt-3">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Stock</p>
                            <div className="flex items-center gap-2">
                              {editingProduct?.id === variant.id && editingProduct?.field === 'stock' ? (
                                <>
                                  <Input
                                    type="number"
                                    value={editingProduct.value as number}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, value: Number(e.target.value) })}
                                    className="w-16 h-8 text-xs"
                                  />
                                  <button
                                    onClick={() => handleUpdateField(variant.id, 'stock', editingProduct.value)}
                                    className="text-xs text-green-600 hover:text-green-700"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => setEditingProduct(null)}
                                    className="text-xs text-red-600 hover:text-red-700"
                                  >
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-sm font-medium">{variant.stock}</span>
                                  <button
                                    onClick={() => setEditingProduct({ id: variant.id, field: 'stock', value: variant.stock })}
                                    className="text-xs text-gray-500 hover:text-gray-600"
                                  >
                                    Edit
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500 mb-1">Price</p>
                            <div className="flex items-center gap-2">
                              {editingProduct?.id === variant.id && editingProduct?.field === 'price' ? (
                                <>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={editingProduct.value as number}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, value: Number(e.target.value) })}
                                    className="w-20 h-8 text-xs"
                                  />
                                  <button
                                    onClick={() => handleUpdateField(variant.id, 'price', editingProduct.value)}
                                    className="text-xs text-green-600 hover:text-green-700"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => setEditingProduct(null)}
                                    className="text-xs text-red-600 hover:text-red-700"
                                  >
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-sm font-medium">${variant.price?.toFixed(2) || '0.00'}</span>
                                  <button
                                    onClick={() => setEditingProduct({ id: variant.id, field: 'price', value: variant.price || 0 })}
                                    className="text-xs text-gray-500 hover:text-gray-600"
                                  >
                                    Edit
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Cost Analysis */}
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-gray-500">Cost:</span>
                              <span className="ml-1 font-medium">${variant.averageCost?.toFixed(2) || '0.00'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Profit:</span>
                              <span className="ml-1 font-medium text-green-600">
                                ${variant.price && variant.averageCost ? calculateProfitPerUnit(variant.price, variant.averageCost).toFixed(2) : '0.00'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
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

      {productGroups.length === 0 && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            No products found
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
            Try adjusting your filters or add some products
          </p>
        </div>
      )}
    </div>
  )
} 