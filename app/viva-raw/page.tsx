'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Package } from "lucide-react"

interface Product {
  _id: string
  baseProductName: string
  variantName: string
  name: string
  description?: string
  category: string
  sku: string
  barcode?: string
  price: number
  stock: number | null
  minimumStock: number
  lastPurchasePrice: number
  averageCost: number
  supplier: string
  active: boolean
  totalSpent: number
  totalPurchased: number
  lastRestockDate?: string
  createdAt: string
  updatedAt: string
}

export default function VivaRawPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingStock, setEditingStock] = useState<string | null>(null)
  const [tempStockValue, setTempStockValue] = useState('')
  const [updatingStock, setUpdatingStock] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Auto-select stock input when editing
  useEffect(() => {
    if (editingStock && inputRef.current) {
      inputRef.current.select()
    }
  }, [editingStock])

  useEffect(() => {
    fetchVivaRawProducts()
  }, [])

  const fetchVivaRawProducts = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/products/search?supplier=Viva%20Raw')
      
      if (!response.ok) {
        throw new Error('Failed to fetch Viva Raw products')
      }

      const data = await response.json()
      // Filter out products with "bulk" in their variant name
      const filteredProducts = (data.products || []).filter((product: Product) => 
        !product.variantName.toLowerCase().includes('bulk')
      )
      setProducts(filteredProducts)
    } catch (err) {
      console.error('Error fetching Viva Raw products:', err)
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }



  const handleStockEdit = (productId: string, currentStock: number | null) => {
    setEditingStock(productId)
    setTempStockValue((currentStock || 0).toString())
  }

  const handleStockSave = async (productId: string) => {
    const newStock = parseInt(tempStockValue) || 0
    setUpdatingStock(productId)
    
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: newStock }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to update stock')
      }
      
      // Update local state
      setProducts(prev => 
        prev.map(p => 
          p._id === productId ? { ...p, stock: newStock } : p
        )
      )
      
      setEditingStock(null)
      setTempStockValue('')
    } catch (err) {
      console.error('Error updating stock:', err)
      alert('Failed to update stock')
    } finally {
      setUpdatingStock(null)
    }
  }

  const handleStockKeyPress = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter') {
      handleStockSave(productId)
    } else if (e.key === 'Escape') {
      setEditingStock(null)
      setTempStockValue('')
    }
  }

  // Group products by type
  const cats = products.filter(p => p.baseProductName.toLowerCase().includes('for cats'))
  const dogs = products.filter(p => p.baseProductName.toLowerCase().includes('for dogs'))
  const pure = products.filter(p => p.baseProductName.toLowerCase().includes('pure'))

  const renderProductGrid = (group: Product[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      {group.map((product) => {
        const currentStock = product.stock || 0
        const isEditingThisStock = editingStock === product._id
        const isUpdatingThisStock = updatingStock === product._id
        return (
          <Card key={product._id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="mb-3">
                <h3 className="font-medium text-gray-900 leading-tight">{product.baseProductName}</h3>
                {product.variantName !== 'Default' && (
                  <p className="text-sm text-blue-600">{product.variantName}</p>
                )}
              </div>
              <div className="mb-3 flex flex-row items-center gap-4">
                <span className="text-lg font-semibold text-green-600">
                  {formatCurrency(product.price)}
                </span>
                <span className="text-sm text-gray-600">In Stock: </span>
                {isEditingThisStock ? (
                  <input
                    ref={inputRef}
                    type="number"
                    value={tempStockValue}
                    onChange={(e) => setTempStockValue(e.target.value)}
                    onBlur={() => handleStockSave(product._id)}
                    onKeyDown={(e) => handleStockKeyPress(e, product._id)}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                    disabled={isUpdatingThisStock}
                  />
                ) : (
                  <span 
                    className={`font-medium cursor-pointer hover:bg-gray-100 px-2 py-1 rounded ${
                      currentStock === 0 ? 'text-red-600' : 'text-gray-900'
                    }`}
                    onClick={() => handleStockEdit(product._id, product.stock)}
                  >
                    {isUpdatingThisStock ? (
                      <Loader2 className="h-4 w-4 animate-spin inline" />
                    ) : (
                      currentStock
                    )}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <span>Loading Viva Raw products...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center py-12">
          <div className="text-red-600 text-lg font-medium mb-2">Error Loading Products</div>
          <div className="text-gray-600 mb-4">{error}</div>
          <button
            onClick={fetchVivaRawProducts}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Viva Raw Products</h1>
        <p className="text-gray-600">
          {products.length} products found from Viva Raw supplier
        </p>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">No Products Found</div>
          <div className="text-gray-600">No products from Viva Raw supplier were found in the database.</div>
        </div>
      ) : (
        <>
          {cats.length > 0 && (
            <>
              <h2 className="text-xl font-bold mb-2 text-pink-700">For Cats</h2>
              {renderProductGrid(cats)}
            </>
          )}
          {dogs.length > 0 && (
            <>
              <h2 className="text-xl font-bold mb-2 text-blue-700">For Dogs</h2>
              {renderProductGrid(dogs)}
            </>
          )}
          {pure.length > 0 && (
            <>
              <h2 className="text-xl font-bold mb-2 text-green-700">Pure</h2>
              {renderProductGrid(pure)}
            </>
          )}
        </>
      )}
    </div>
  )
} 