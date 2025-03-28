'use client'

import { useState } from 'react'
import { Product } from '@/types'
import { getPreTaxPrice, calculateProfitMargin, calculateProfitPerUnit, SALES_TAX_RATE } from '@/lib/utils/pricing'

type ProductFormProps = {
  onSuccess: () => void
  initialData?: Product
}

export function ProductForm({ onSuccess, initialData }: ProductFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const [formData, setFormData] = useState<Omit<Product, '_id' | 'id' | 'platformMetadata' | 'syncStatus'>>({
    name: initialData?.name || '',
    baseProductName: initialData?.baseProductName || '',
    variantName: initialData?.variantName || '',
    sku: initialData?.sku || '',
    description: initialData?.description || '',
    lastPurchasePrice: initialData?.lastPurchasePrice || 0,
    averageCost: initialData?.averageCost || 0,
    price: initialData?.price || 0,
    stock: initialData?.stock || 0,
    minimumStock: initialData?.minimumStock || 0,
    supplier: initialData?.supplier || '',
    category: initialData?.category || '',
    barcode: initialData?.barcode || '',
    active: initialData?.active ?? true,
    costHistory: initialData?.costHistory || [],
    totalSpent: initialData?.totalSpent || 0,
    totalPurchased: initialData?.totalPurchased || 0,
    lastRestockDate: initialData?.lastRestockDate || new Date().toISOString(),
    isProxied: initialData?.isProxied || false,
    proxyOf: initialData?.proxyOf || undefined,
    proxyRatio: initialData?.proxyRatio || undefined
  })

  // Calculate pre-tax price whenever price changes
  const preTaxPrice = getPreTaxPrice(formData.price)
  const salesTaxAmount = formData.price - preTaxPrice
  const potentialProfitMargin = calculateProfitMargin(formData.price, formData.lastPurchasePrice)
  const potentialProfitPerUnit = calculateProfitPerUnit(formData.price, formData.lastPurchasePrice)

  async function syncToSquare(productId: string) {
    setSyncing(true)
    try {
      const response = await fetch('/api/products/sync/square/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId })
      })

      if (!response.ok) {
        throw new Error('Failed to sync with Square')
      }

      const result = await response.json()
      console.log('Square sync result:', result)
    } catch (err) {
      console.error('Square sync error:', err)
      setError(err instanceof Error ? err.message : 'Failed to sync with Square')
    } finally {
      setSyncing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Save to our database first
      const response = await fetch('/api/products', {
        method: initialData ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initialData ? { id: initialData.id, ...formData } : formData)
      })

      if (!response.ok) throw new Error('Failed to save product')
      
      const savedProduct = await response.json()
      
      // Sync to Square
      await syncToSquare(savedProduct.id)
      
      onSuccess()
      // Reset form if not editing
      if (!initialData) {
        setFormData({
          name: '',
          baseProductName: '',
          variantName: '',
          sku: '',
          description: '',
          lastPurchasePrice: 0,
          averageCost: 0,
          price: 0,
          stock: 0,
          minimumStock: 0,
          supplier: '',
          category: '',
          barcode: '',
          active: true,
          costHistory: [],
          totalSpent: 0,
          totalPurchased: 0,
          lastRestockDate: new Date().toISOString(),
          isProxied: false,
          proxyOf: undefined,
          proxyRatio: undefined
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Product Name
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            SKU
          </label>
          <input
            type="text"
            required
            value={formData.sku}
            onChange={e => setFormData(prev => ({ ...prev, sku: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        {/* Cost Information */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
            Cost Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Last Purchase Price
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">$</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.lastPurchasePrice}
                  onChange={e => setFormData(prev => ({ ...prev, lastPurchasePrice: Number(e.target.value) }))}
                  className="pl-7 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Price (with {(SALES_TAX_RATE * 100).toFixed(3)}% tax)
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">$</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.price}
                  onChange={e => setFormData(prev => ({ ...prev, price: Number(e.target.value) }))}
                  className="pl-7 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Pre-tax price: ${preTaxPrice.toFixed(2)} + Tax: ${salesTaxAmount.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Profit Margin Calculator */}
          {formData.lastPurchasePrice > 0 && formData.price > 0 && (
            <div className="mt-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600 dark:text-gray-400">
                    Potential Margin:{' '}
                    <span className={`font-medium ${
                      potentialProfitMargin >= 30 ? 'text-green-600' : 'text-yellow-600'
                    }`}>
                      {potentialProfitMargin.toFixed(1)}%
                    </span>
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">
                    Potential Profit per Unit:{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      ${potentialProfitPerUnit.toFixed(2)}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">
                    Pre-tax Margin:{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {((preTaxPrice - formData.lastPurchasePrice) / formData.lastPurchasePrice * 100).toFixed(1)}%
                    </span>
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">
                    Pre-tax Profit:{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      ${(preTaxPrice - formData.lastPurchasePrice).toFixed(2)}
                    </span>
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Note: Actual margins will be calculated based on average cost after purchases are recorded.
                All calculations account for {(SALES_TAX_RATE * 100).toFixed(3)}% sales tax.
              </p>
            </div>
          )}
        </div>

        {/* Stock Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Stock
            </label>
            <input
              type="number"
              min="0"
              required
              value={formData.stock}
              onChange={e => setFormData(prev => ({ ...prev, stock: Number(e.target.value) }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Minimum Stock
            </label>
            <input
              type="number"
              min="0"
              required
              value={formData.minimumStock}
              onChange={e => setFormData(prev => ({ ...prev, minimumStock: Number(e.target.value) }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading || syncing}
          className="flex-1 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? 'Saving...' : syncing ? 'Syncing...' : initialData ? 'Update Product' : 'Add Product'}
        </button>
      </div>
    </form>
  )
} 