'use client'

import { useState, useEffect } from 'react'
import { Card } from "@/components/ui/card"
import { Product } from '@/types'
import { ProductForm } from '@/components/product-form'
import { ProductList } from '@/components/product-list'
import { PurchaseInvoiceForm } from '@/components/purchase-invoice-form'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'list' | 'new' | 'purchase'>('list')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    try {
      console.log('Fetching products...')
      const response = await fetch('/api/products')
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch products')
      }
      
      const data = await response.json()
      console.log(`Fetched ${data.products?.length || 0} products`)
      setProducts(data.products || [])
    } catch (err) {
      console.error('Error fetching products:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch products')
    } finally {
      setLoading(false)
    }
  }

  async function syncSquareProducts() {
    try {
      setSyncing(true)
      const response = await fetch('/api/products/sync/square', {
        method: 'POST'
      })
      
      if (!response.ok) {
        throw new Error('Failed to sync products')
      }

      const result = await response.json()
      console.log('Sync result:', result)
      
      // Refresh product list
      await fetchProducts()
    } catch (err) {
      console.error('Sync error:', err)
      setError(err instanceof Error ? err.message : 'Failed to sync products')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return <div>Loading products...</div>
  }

  if (error) {
    return <div>Error: {error}</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Product Management
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Manage your products, costs, and inventory
            </p>
          </div>
          <button
            onClick={syncSquareProducts}
            disabled={syncing}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-400 hover:bg-primary-500 disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync Square Products'}
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-8">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('list')}
              className={`${
                activeTab === 'list'
                  ? 'border-primary-400 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Product List
            </button>
            <button
              onClick={() => setActiveTab('new')}
              className={`${
                activeTab === 'new'
                  ? 'border-primary-400 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              New Product
            </button>
            <button
              onClick={() => setActiveTab('purchase')}
              className={`${
                activeTab === 'purchase'
                  ? 'border-primary-400 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Record Purchase
            </button>
          </nav>
        </div>

        {/* Content */}
        {activeTab === 'list' && (
          <ProductList products={products} onUpdate={fetchProducts} />
        )}
        
        {activeTab === 'new' && (
          <Card className="p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Add New Product
            </h2>
            <ProductForm onSuccess={fetchProducts} />
          </Card>
        )}

        {activeTab === 'purchase' && (
          <PurchaseInvoiceForm products={products} onSuccess={fetchProducts} />
        )}
      </div>
    </div>
  )
} 