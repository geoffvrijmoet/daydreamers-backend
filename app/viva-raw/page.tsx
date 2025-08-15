'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Package, Edit3, Check, X, Copy } from "lucide-react"

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
  const [copiedSection, setCopiedSection] = useState<'cats' | 'dogs' | 'pure' | null>(null)
  const [copiedBlurbType, setCopiedBlurbType] = useState<'stock' | 'price' | null>(null)
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

  const handleStockCancel = () => {
    setEditingStock(null)
    setTempStockValue('')
  }

  const handleStockKeyPress = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter') {
      handleStockSave(productId)
    } else if (e.key === 'Escape') {
      handleStockCancel()
    }
  }

  // Group products by type
  const cats = products.filter(p => p.baseProductName.toLowerCase().includes('for cats'))
  const dogs = products.filter(p => p.baseProductName.toLowerCase().includes('for dogs'))
  const pure = products.filter(p => p.baseProductName.toLowerCase().includes('pure'))

  // Helpers: extract recipe and unit weight in lbs
  const extractRecipe = (baseName: string) => {
    // Examples:
    // "Viva Raw Turkey for Cats 1 lb - Regular" => Turkey
    // "Viva Raw Pure Rabbit 1 lb - Regular" => Rabbit
    const pureMatch = baseName.match(/^\s*Viva\s+Raw\s+Pure\s+([^\d-]+)/i)
    if (pureMatch && pureMatch[1]) return pureMatch[1].trim()
    const forMatch = baseName.match(/^\s*Viva\s+Raw\s+(.+?)\s+for\s+(Cats|Dogs)/i)
    if (forMatch && forMatch[1]) return forMatch[1].trim()
    // Fallback: remove prefixes and qualifiers
    return baseName
      .replace(/^\s*Viva\s+Raw\s*/i, '')
      .replace(/\s+for\s+(Cats|Dogs).*/i, '')
      .replace(/\s+Pure\s+/i, ' ')
      .replace(/\s*\d+\s*(lb|oz).*/i, '')
      .trim()
  }

  const getUnitWeightLbs = (product: Product) => {
    const search = `${product.variantName || ''} ${product.baseProductName || ''}`
    const weightMatch = search.match(/(\d+(?:\.\d+)?)\s*(lb|oz)/i)
    if (!weightMatch) return 1 // default to 1 lb
    const value = parseFloat(weightMatch[1])
    const unit = weightMatch[2].toLowerCase()
    if (unit === 'oz') return value / 16
    return value
  }

  const roundLbs = (lbs: number) => {
    // keep .5 where applicable, otherwise round to integer; limit to 2 decimals otherwise
    const roundedToQuarter = Math.round(lbs * 4) / 4
    if (Math.abs(roundedToQuarter - Math.round(roundedToQuarter)) < 1e-6) {
      return `${Math.round(roundedToQuarter)} lb`
    }
    if (Math.abs(roundedToQuarter * 2 - Math.round(roundedToQuarter * 2)) < 1e-6) {
      return `${(Math.round(roundedToQuarter * 2) / 2).toFixed(1)} lb`
    }
    return `${roundedToQuarter.toFixed(2)} lb`
  }

  // Custom sorting function to prioritize main recipes
  const sortRecipes = (a: [string, number], b: [string, number]) => {
    const priorityRecipes = ['Beef', 'Chicken', 'Duck', 'Rabbit', 'Turkey']
    const aIndex = priorityRecipes.indexOf(a[0])
    const bIndex = priorityRecipes.indexOf(b[0])
    
    // If both are priority recipes, sort by priority order
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex
    }
    
    // If only one is priority, prioritize it
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    
    // If neither is priority, sort alphabetically
    return a[0].localeCompare(b[0])
  }

  // Build concise in-stock blurb for copy using recipe + total lbs
  const buildBlurb = (label: string, group: Product[]) => {
    const totalsByRecipe = new Map<string, number>()

    group
      .filter(p => (p.stock || 0) > 0)
      .forEach(p => {
        const recipe = extractRecipe(p.baseProductName)
        const unitLbs = getUnitWeightLbs(p)
        const qty = p.stock || 0
        const prev = totalsByRecipe.get(recipe) || 0
        totalsByRecipe.set(recipe, prev + qty * unitLbs)
      })

    const entries = Array.from(totalsByRecipe.entries())
      .sort(sortRecipes)
      .map(([recipe, lbs]) => `${recipe} ${roundLbs(lbs)}`)

    if (entries.length === 0) return `Viva Raw — ${label}: currently out of stock.`
    return entries.join(', ')
  }

  // Build price blurb showing recipe names with their prices
  const buildPriceBlurb = (label: string, group: Product[]) => {
    const pricesByRecipe = new Map<string, number>()

    group.forEach((p, index) => {
      try {
        const recipe = extractRecipe(p.baseProductName)
        // Only add products with valid prices
        if (p.price !== null && p.price !== undefined && !pricesByRecipe.has(recipe)) {
          pricesByRecipe.set(recipe, p.price)
        }
      } catch (error) {
        console.error(`Error processing product ${index}:`, error, p)
      }
    })

    const entries = Array.from(pricesByRecipe.entries())
      .sort(sortRecipes)
      .map(([recipe, price]) => `${recipe} $${price.toFixed(2)}`)

    return entries.length === 0 ? `Viva Raw — ${label}: no products found.` : entries.join(', ')
  }

  const handleCopyBlurb = async (section: 'cats' | 'dogs' | 'pure', blurbType: 'stock' | 'price', group: Product[]) => {
    try {
      const label = section === 'cats' ? 'For Cats' : section === 'dogs' ? 'For Dogs' : 'Pure'
      const text = blurbType === 'stock' ? buildBlurb(label, group) : buildPriceBlurb(label, group)
      
      await navigator.clipboard.writeText(text)
      setCopiedSection(section)
      setCopiedBlurbType(blurbType)
      setTimeout(() => {
        setCopiedSection(null)
        setCopiedBlurbType(null)
      }, 1500)
    } catch (error) {
      console.error('Failed to copy blurb:', error)
    }
  }

  const renderProductGrid = (group: Product[]) => {
    // Sort products by recipe priority
    const sortedGroup = [...group].sort((a, b) => {
      const aRecipe = extractRecipe(a.baseProductName)
      const bRecipe = extractRecipe(b.baseProductName)
      return sortRecipes([aRecipe, 0], [bRecipe, 0])
    })

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-4 mb-8 sm:mb-10">
        {sortedGroup.map((product) => {
          const currentStock = product.stock || 0
          const isEditingThisStock = editingStock === product._id
          const isUpdatingThisStock = updatingStock === product._id
          const isLowStock = currentStock <= product.minimumStock
          const recipeName = extractRecipe(product.baseProductName)
          
          return (
            <Card key={product._id} className="hover:shadow-md transition-shadow border-gray-200">
              <CardContent className="p-2 sm:p-4">
                {/* Desktop view - recipe name */}
                <div className="mb-3 hidden sm:block">
                  <h3 className="font-medium text-gray-900 leading-tight text-sm sm:text-base line-clamp-2">
                    {recipeName}
                  </h3>
                  {product.variantName !== 'Default' && (
                    <p className="text-xs sm:text-sm text-blue-600 mt-1">{product.variantName}</p>
                  )}
                </div>
                
                {/* Mobile view - horizontal layout */}
                <div className="sm:hidden">
                  <div className="flex items-center justify-between gap-2">
                    {/* Recipe name */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 text-sm truncate">
                        {recipeName}
                      </h3>
                    </div>
                    
                    {/* Price */}
                    <div className="flex-shrink-0">
                      <span className="text-sm font-semibold text-green-600">
                        {formatCurrency(product.price)}
                      </span>
                    </div>
                    
                    {/* Stock section */}
                    <div className="flex-shrink-0">
                      {isEditingThisStock ? (
                        <div className="flex items-center gap-1">
                          <input
                            ref={inputRef}
                            type="number"
                            value={tempStockValue}
                            onChange={(e) => setTempStockValue(e.target.value)}
                            onKeyDown={(e) => handleStockKeyPress(e, product._id)}
                            className="w-12 px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                            autoFocus
                            disabled={isUpdatingThisStock}
                            min="0"
                          />
                          <button
                            onClick={() => handleStockSave(product._id)}
                            disabled={isUpdatingThisStock}
                            className="p-0.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                          >
                            {isUpdatingThisStock ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </button>
                          <button
                            onClick={handleStockCancel}
                            disabled={isUpdatingThisStock}
                            className="p-0.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div 
                          className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-colors ${
                            isLowStock 
                              ? 'bg-red-50 border border-red-200 hover:bg-red-100' 
                              : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                          }`}
                          onClick={() => handleStockEdit(product._id, product.stock)}
                        >
                          <span 
                            className={`font-medium text-xs ${
                              currentStock === 0 
                                ? 'text-red-600' 
                                : isLowStock 
                                  ? 'text-orange-600' 
                                  : 'text-gray-900'
                            }`}
                          >
                            {isUpdatingThisStock ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              currentStock
                            )}
                          </span>
                          <Edit3 className="h-2.5 w-2.5 text-gray-400" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Low stock/out of stock warnings - only show if needed */}
                  {(isLowStock && currentStock > 0) && (
                    <p className="text-xs text-orange-600 mt-1">Low stock</p>
                  )}
                  {currentStock === 0 && (
                    <p className="text-xs text-red-600 mt-1">Out of stock</p>
                  )}
                </div>
                
                {/* Desktop view - original vertical layout */}
                <div className="hidden sm:block">
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className="text-sm sm:text-lg font-semibold text-green-600">
                        {formatCurrency(product.price)}
                      </span>
                      <span className="text-xs sm:text-sm text-gray-500">Stock</span>
                    </div>
                    
                    {isEditingThisStock ? (
                      <div className="flex items-center gap-1 sm:gap-2">
                        <input
                          ref={inputRef}
                          type="number"
                          value={tempStockValue}
                          onChange={(e) => setTempStockValue(e.target.value)}
                          onKeyDown={(e) => handleStockKeyPress(e, product._id)}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          autoFocus
                          disabled={isUpdatingThisStock}
                          min="0"
                        />
                        <button
                          onClick={() => handleStockSave(product._id)}
                          disabled={isUpdatingThisStock}
                          className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                        >
                          {isUpdatingThisStock ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={handleStockCancel}
                          disabled={isUpdatingThisStock}
                          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div 
                        className={`flex items-center justify-between p-1.5 sm:p-2 rounded-lg cursor-pointer transition-colors ${
                          isLowStock 
                            ? 'bg-red-50 border border-red-200 hover:bg-red-100' 
                            : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                        }`}
                        onClick={() => handleStockEdit(product._id, product.stock)}
                      >
                        <span 
                          className={`font-medium text-sm sm:text-base ${
                            currentStock === 0 
                              ? 'text-red-600' 
                              : isLowStock 
                                ? 'text-orange-600' 
                                : 'text-gray-900'
                          }`}
                        >
                          {isUpdatingThisStock ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            currentStock
                          )}
                        </span>
                        <Edit3 className="h-3 w-3 text-gray-400" />
                      </div>
                    )}
                    
                    {isLowStock && currentStock > 0 && (
                      <p className="text-xs text-orange-600 mt-1">Low stock</p>
                    )}
                    {currentStock === 0 && (
                      <p className="text-xs text-red-600 mt-1">Out of stock</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin mr-2" />
          <span className="text-sm sm:text-base">Loading Viva Raw products...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="text-center py-12">
          <div className="text-red-600 text-base sm:text-lg font-medium mb-2">Error Loading Products</div>
          <div className="text-gray-600 mb-4 text-sm sm:text-base">{error}</div>
          <button
            onClick={fetchVivaRawProducts}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Viva Raw Products</h1>
        <p className="text-gray-600 text-sm sm:text-base">
          {products.length} products found from Viva Raw supplier
        </p>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <div className="text-base sm:text-lg font-medium text-gray-900 mb-2">No Products Found</div>
          <div className="text-gray-600 text-sm sm:text-base">No products from Viva Raw supplier were found in the database.</div>
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {cats.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h2 className="text-lg sm:text-xl font-bold text-pink-700 flex items-center">
                  <span className="w-3 h-3 bg-pink-500 rounded-full mr-2"></span>
                  For Cats ({cats.length})
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopyBlurb('cats', 'stock', cats)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs sm:text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                  >
                    {copiedSection === 'cats' && copiedBlurbType === 'stock' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedSection === 'cats' && copiedBlurbType === 'stock' ? 'Copied' : 'Stock blurb'}
                  </button>
                  <button
                    onClick={() => handleCopyBlurb('cats', 'price', cats)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs sm:text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                  >
                    {copiedSection === 'cats' && copiedBlurbType === 'price' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedSection === 'cats' && copiedBlurbType === 'price' ? 'Copied' : 'Price blurb'}
                  </button>
                </div>
              </div>
              {renderProductGrid(cats)}
            </div>
          )}
          
          {dogs.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h2 className="text-lg sm:text-xl font-bold text-blue-700 flex items-center">
                  <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                  For Dogs ({dogs.length})
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopyBlurb('dogs', 'stock', dogs)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs sm:text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                  >
                    {copiedSection === 'dogs' && copiedBlurbType === 'stock' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedSection === 'dogs' && copiedBlurbType === 'stock' ? 'Copied' : 'Stock blurb'}
                  </button>
                  <button
                    onClick={() => handleCopyBlurb('dogs', 'price', dogs)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs sm:text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                  >
                    {copiedSection === 'dogs' && copiedBlurbType === 'price' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedSection === 'dogs' && copiedBlurbType === 'price' ? 'Copied' : 'Price blurb'}
                  </button>
                </div>
              </div>
              {renderProductGrid(dogs)}
            </div>
          )}
          
          {pure.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h2 className="text-lg sm:text-xl font-bold text-green-700 flex items-center">
                  <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                  Pure ({pure.length})
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopyBlurb('pure', 'stock', pure)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs sm:text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                  >
                    {copiedSection === 'pure' && copiedBlurbType === 'stock' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedSection === 'pure' && copiedBlurbType === 'stock' ? 'Copied' : 'Stock blurb'}
                  </button>
                  <button
                    onClick={() => handleCopyBlurb('pure', 'price', pure)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs sm:text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                  >
                    {copiedSection === 'pure' && copiedBlurbType === 'price' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedSection === 'pure' && copiedBlurbType === 'price' ? 'Copied' : 'Price blurb'}
                  </button>
                </div>
              </div>
              {renderProductGrid(pure)}
            </div>
          )}
        </div>
      )}
    </div>
  )
} 