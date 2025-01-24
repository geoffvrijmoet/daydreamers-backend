'use client'

import { useState } from 'react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Loader2, ChevronDown, ChevronRight, Search } from 'lucide-react'

type MongoProduct = {
  _id: string
  name: string
  sku: string
  retailPrice: number
}

type ShopifyProduct = {
  id: string
  title: string
  description?: string
  sku?: string
  price: number
  variantId: string
}

type ProductWithMatches = {
  shopify: ShopifyProduct
  matches: MongoProduct[]
  selectedMatch?: string // MongoDB _id of selected match
  isExistingMatch: boolean
}

interface ShopifySyncReviewProps {
  onSuccess?: () => void
}

export function ShopifySyncReview({ onSuccess }: ShopifySyncReviewProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductWithMatches[]>([])
  const [syncing, setSyncing] = useState(false)
  const [step, setStep] = useState<'initial' | 'review'>('initial')
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())
  const [searchResults, setSearchResults] = useState<Map<string, MongoProduct[]>>(new Map())
  const [searching, setSearching] = useState<Set<string>>(new Set())
  const [stats, setStats] = useState<{
    totalShopify: number
    totalMongo: number
    totalMatched: number
    totalUnmatched: number
  }>({
    totalShopify: 0,
    totalMongo: 0,
    totalMatched: 0,
    totalUnmatched: 0
  })

  // Fetch products from Shopify
  const fetchShopifyProducts = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/products/shopify/preview')
      if (!response.ok) {
        throw new Error('Failed to fetch Shopify products')
      }
      const data = await response.json()
      
      setProducts(data.products)
      setStats({
        totalShopify: data.totalShopify,
        totalMongo: data.totalMongo,
        totalMatched: data.totalMatched,
        totalUnmatched: data.totalUnmatched
      })
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch Shopify products')
    } finally {
      setLoading(false)
    }
  }

  // Toggle product expansion
  const toggleProduct = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  // Update selected match for a product
  const updateSelectedMatch = (shopifyId: string, mongoId: string | undefined) => {
    setProducts(prev => prev.map(p => 
      p.shopify.id === shopifyId && !p.isExistingMatch 
        ? { ...p, selectedMatch: mongoId }
        : p
    ))
  }

  // Search for MongoDB products
  const searchMongoProducts = async (shopifyId: string, query: string) => {
    if (!query.trim()) {
      setSearchResults(prev => {
        const next = new Map(prev)
        next.delete(shopifyId)
        return next
      })
      return
    }

    try {
      const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`)
      if (!response.ok) {
        throw new Error('Failed to search products')
      }
      const data = await response.json()
      
      setSearchResults(prev => {
        const next = new Map(prev)
        next.set(shopifyId, data.products)
        return next
      })
    } catch (err) {
      console.error('Search error:', err)
    }
  }

  // Handle search input
  const handleSearch = async (shopifyId: string, query: string) => {
    // Add to searching set to show loading state
    setSearching(prev => new Set(prev).add(shopifyId))
    
    // Debounce search
    await new Promise(resolve => setTimeout(resolve, 300))
    
    await searchMongoProducts(shopifyId, query)
    
    // Remove from searching set
    setSearching(prev => {
      const next = new Set(prev)
      next.delete(shopifyId)
      return next
    })
  }

  // Handle the final sync
  const handleSync = async () => {
    setSyncing(true)
    try {
      const selectedMatches = products
        .filter(p => p.selectedMatch) // Only include products with selected matches
        .map(p => ({
          shopifyId: p.shopify.id,
          shopifyVariantId: p.shopify.variantId,
          mongoId: p.selectedMatch
        }))

      const response = await fetch('/api/products/sync/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches: selectedMatches })
      })

      if (!response.ok) {
        throw new Error('Failed to sync products')
      }

      // Reset state after successful sync
      setProducts([])
      setStep('initial')
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync products')
    } finally {
      setSyncing(false)
    }
  }

  if (step === 'initial') {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-medium mb-4">Match Shopify Products</h2>
        <p className="text-sm text-gray-600 mb-4">
          This will fetch your Shopify catalog and help you match products with your existing database.
        </p>
        <Button
          onClick={fetchShopifyProducts}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fetching Products...
            </>
          ) : (
            'Fetch Shopify Products'
          )}
        </Button>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </Card>
    )
  }

  const selectedCount = products.filter(p => p.selectedMatch).length

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-medium">Match Shopify Products</h2>
          <div className="text-sm text-gray-600 space-y-1">
            <p>Found {stats.totalShopify} Shopify products</p>
            <p>{stats.totalMatched} already matched, {stats.totalUnmatched} unmatched products in database</p>
          </div>
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            onClick={() => setStep('initial')}
            disabled={syncing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSync}
            disabled={syncing || selectedCount === 0}
          >
            {syncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              `Sync ${selectedCount} New Matches`
            )}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600">{error}</p>
      )}

      <div className="space-y-2">
        {products.map(product => (
          <div 
            key={product.shopify.id} 
            className={`border rounded-md ${product.isExistingMatch ? 'bg-gray-50' : ''}`}
          >
            <div 
              className="flex items-center p-4 cursor-pointer hover:bg-gray-100"
              onClick={() => toggleProduct(product.shopify.id)}
            >
              {expandedProducts.has(product.shopify.id) ? (
                <ChevronDown className="w-4 h-4 mr-2 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 mr-2 text-gray-500" />
              )}
              <div className="flex-1">
                <span className="font-medium">{product.shopify.title}</span>
                <span className="ml-2 text-sm text-gray-500">
                  ${product.shopify.price.toFixed(2)}
                </span>
                {product.shopify.sku && (
                  <span className="ml-2 text-sm text-gray-500">
                    (SKU: {product.shopify.sku})
                  </span>
                )}
              </div>
              <div className="text-sm">
                {product.isExistingMatch ? (
                  <span className="text-green-600">Already Matched</span>
                ) : (
                  <span className="text-gray-500">
                    {product.matches.length} potential matches
                  </span>
                )}
              </div>
            </div>

            {expandedProducts.has(product.shopify.id) && (
              <div className="px-4 pb-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">
                    {product.shopify.description}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {product.isExistingMatch ? 'Current Match' : 'Select Matching Product'}
                  </label>
                  <div className="space-y-2">
                    {!product.isExistingMatch && (
                      <div className="flex items-center">
                        <input
                          type="radio"
                          name={`match-${product.shopify.id}`}
                          checked={!product.selectedMatch}
                          onChange={() => updateSelectedMatch(product.shopify.id, undefined)}
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-600">No match - skip this product</span>
                      </div>
                    )}
                    
                    {/* Show matches section */}
                    {product.matches.length > 0 ? (
                      product.matches.map(match => (
                        <div key={match._id} className="flex items-center">
                          {!product.isExistingMatch && (
                            <input
                              type="radio"
                              name={`match-${product.shopify.id}`}
                              checked={product.selectedMatch === match._id}
                              onChange={() => updateSelectedMatch(product.shopify.id, match._id)}
                              className="mr-2"
                            />
                          )}
                          <span className="text-sm">
                            {match.name}
                            <span className="ml-2 text-gray-500">
                              ${match.retailPrice.toFixed(2)}
                              {match.sku && ` - SKU: ${match.sku}`}
                            </span>
                            {product.isExistingMatch && (
                              <span className="ml-2 text-green-600">(Current Match)</span>
                            )}
                          </span>
                        </div>
                      ))
                    ) : !product.isExistingMatch && (
                      // Show search bar for products with no matches
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Search for a product to match..."
                            className="pl-8"
                            onChange={e => handleSearch(product.shopify.id, e.target.value)}
                          />
                        </div>
                        
                        {/* Show search results */}
                        {searching.has(product.shopify.id) ? (
                          <div className="text-sm text-gray-600">
                            Searching...
                          </div>
                        ) : searchResults.get(product.shopify.id)?.length ? (
                          <div className="space-y-1">
                            {searchResults.get(product.shopify.id)?.map(result => (
                              <div key={result._id} className="flex items-center">
                                <input
                                  type="radio"
                                  name={`match-${product.shopify.id}`}
                                  checked={product.selectedMatch === result._id}
                                  onChange={() => updateSelectedMatch(product.shopify.id, result._id)}
                                  className="mr-2"
                                />
                                <span className="text-sm">
                                  {result.name}
                                  <span className="ml-2 text-gray-500">
                                    ${result.retailPrice.toFixed(2)}
                                    {result.sku && ` - SKU: ${result.sku}`}
                                  </span>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
} 