'use client'

import { useState, useEffect } from 'react'
import { Card } from "@/components/ui/card"
import { Product } from '@/types'
import { ProductForm } from '@/components/product-form'
import { ProductList } from '@/components/product-list'
import { PurchaseInvoiceForm } from '@/components/purchase-invoice-form'
import { SquareSyncReview } from '@/components/square-sync-review'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'list' | 'new' | 'purchase' | 'sync'>('list')

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="text-gray-600 dark:text-gray-400">Loading products...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="text-red-600">Error: {error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Product Management
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage your products, costs, and inventory
          </p>
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
            <button
              onClick={() => setActiveTab('sync')}
              className={`${
                activeTab === 'sync'
                  ? 'border-primary-400 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Square Sync
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

        {activeTab === 'sync' && (
          <SquareSyncReview onSuccess={fetchProducts} />
        )}
      </div>
    </div>
  )
} 