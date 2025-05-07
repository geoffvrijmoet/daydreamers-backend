'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Product } from '@/types'
import { cn } from '@/lib/utils'
import { StrictMode } from 'react'

interface ShopifyProduct {
  id: string
  title: string
  description?: string
  sku?: string
  price: number
  variantId: string
  mongoProductId?: string
}

interface ShopifyPreviewProduct {
  shopify: ShopifyProduct
  matches: Array<{
    _id: string
    name: string
    sku: string
    price: number
  }>
  selectedMatch?: string
  isExistingMatch: boolean
}

interface ShopifyPreviewResponse {
  products: ShopifyPreviewProduct[]
  totalShopify: number
  totalMongo: number
  totalMatched: number
  totalUnmatched: number
}

interface ShopifySyncReviewProps {
  onSuccess?: () => Promise<void> | void;
}

function MatchedProductPair({ mongoProduct, shopifyProduct }: {
  mongoProduct: Product
  shopifyProduct: ShopifyProduct
}) {
  return (
    <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-green-50 border-green-200">
      <div>
        <h4 className="font-medium">{mongoProduct.name}</h4>
        <p className="text-sm text-gray-500">SKU: {mongoProduct.sku}</p>
        <p className="text-sm text-gray-500">Price: ${mongoProduct.price.toFixed(2)}</p>
      </div>
      <div>
        <h4 className="font-medium">{shopifyProduct.title}</h4>
        <p className="text-sm text-gray-500">SKU: {shopifyProduct.sku || 'No SKU'}</p>
        <p className="text-sm text-gray-500">
          Price: ${typeof shopifyProduct.price === 'number' ? shopifyProduct.price.toFixed(2) : 'N/A'}
        </p>
      </div>
    </div>
  )
}

function ProductList({ products, matches, onSearch }: {
  products: Product[]
  matches: Record<string, string>
  onSearch: (productId: string, term: string) => void
}) {
  // Track search terms for each product
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({})
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null)

  const handleSearch = (productId: string, term: string) => {
    setSearchTerms(prev => ({ ...prev, [productId]: term }))
    setActiveSearchId(term ? productId : null)
    onSearch(productId, term)
  }

  // Reset search ONLY when matches object changes
  useEffect(() => {
    // Only reset if there are actual changes to matches
    setSearchTerms({})
    setActiveSearchId(null)
    
    if (products && products.length > 0) {
      products.forEach(product => {
        onSearch(product._id || product.id, '')
      })
    }
  }, [matches, products, onSearch])

  // Sort products to move actively searched product to top
  const sortedProducts = useMemo(() => {
    if (!activeSearchId) return products;
    
    return [...products].sort((a, b) => {
      const aId = a._id || a.id;
      const bId = b._id || b.id;
      
      if (aId === activeSearchId) return -1;
      if (bId === activeSearchId) return 1;
      return 0;
    });
  }, [products, activeSearchId]);

  return (
    <Droppable droppableId="mongo-list">
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className="grid grid-rows-[auto] gap-4 content-start"
        >
          {sortedProducts.map((product, index) => (
            <Draggable
              key={product._id || product.id}
              draggableId={`mongo-${product._id || product.id}`}
              index={index}
              isDragDisabled={Object.values(matches).includes(product._id || product.id)}
            >
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
                  className={cn(
                    "p-4 rounded-lg border min-h-[120px] flex flex-col justify-between",
                    Object.values(matches).includes(product._id || product.id) ? "border-green-200 bg-green-50" : "border-gray-200",
                    (product._id || product.id) === activeSearchId ? "border-blue-500 shadow-md" : "",
                    snapshot.isDragging ? "shadow-lg" : ""
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{product.name}</h4>
                        <p className="text-sm text-gray-500">SKU: {product.sku}</p>
                        <p className="text-sm text-gray-500">Price: ${product.price?.toFixed(2)}</p>
                      </div>
                      {Object.values(matches).includes(product._id || product.id) && (
                        <div className="text-sm text-green-600">
                          ✓ Matched
                        </div>
                      )}
                    </div>
                    {!Object.values(matches).includes(product._id || product.id) && (
                      <Input
                        placeholder="Search matching Shopify product..."
                        value={searchTerms[product._id || product.id] || ''}
                        onChange={e => handleSearch(product._id || product.id, e.target.value)}
                        className="text-sm"
                        size={40}
                      />
                    )}
                  </div>
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  )
}

function ShopifyProductList({ products, matches, visibilityFilter }: {
  products: ShopifyProduct[]
  matches: Record<string, string>
  visibilityFilter: Record<string, boolean>
}) {
  return (
    <div className="grid grid-rows-[auto] gap-4 content-start">
      {products.map(product => (
        <Droppable
          key={product.id}
          droppableId={`shopify-${product.id}`}
        >
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{ display: visibilityFilter[product.id] === false ? 'none' : undefined }}
              className={cn(
                "p-4 rounded-lg border min-h-[120px] flex flex-col justify-between",
                matches[product.id] ? "border-green-200 bg-green-50" : "border-gray-200",
                snapshot.isDraggingOver ? "border-blue-500 bg-blue-50" : ""
              )}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium">{product.title}</h4>
                  <p className="text-sm text-gray-500">
                    SKU: {product.sku || 'No SKU'}
                  </p>
                  <p className="text-sm text-gray-500">
                    Price: ${typeof product.price === 'number' ? product.price.toFixed(2) : 'N/A'}
                  </p>
                </div>
                {matches[product.id] && (
                  <div className="text-sm text-green-600">
                    ✓ Matched
                  </div>
                )}
              </div>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      ))}
    </div>
  )
}

// Add similarity scoring function
function calculateSimilarity(mongoName: string, shopifyTitle: string): number {
  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const mongoNorm = normalize(mongoName);
  const shopifyNorm = normalize(shopifyTitle);

  // Direct substring match
  if (mongoNorm.includes(shopifyNorm) || shopifyNorm.includes(mongoNorm)) {
    return 0.8;
  }

  // Word-by-word similarity
  const mongoWords = mongoNorm.split(/\s+/);
  const shopifyWords = shopifyNorm.split(/\s+/);
  let matchedWords = 0;

  mongoWords.forEach(word => {
    if (shopifyWords.some(shopifyWord => 
      shopifyWord.includes(word) || word.includes(shopifyWord)
    )) {
      matchedWords++;
    }
  });

  return matchedWords / Math.max(mongoWords.length, shopifyWords.length);
}

// Add sorting function for unmatched products
function sortByMostSimilar(mongoProducts: Product[], shopifyProducts: ShopifyProduct[]): Product[] {
  return [...mongoProducts].sort((a, b) => {
    const aMaxSimilarity = Math.max(...shopifyProducts.map(sp => calculateSimilarity(a.name, sp.title)));
    const bMaxSimilarity = Math.max(...shopifyProducts.map(sp => calculateSimilarity(b.name, sp.title)));
    return bMaxSimilarity - aMaxSimilarity;
  });
}

export function ShopifySyncReview({ onSuccess }: ShopifySyncReviewProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([])
  const [mongoProducts, setMongoProducts] = useState<Product[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [matches, setMatches] = useState<Record<string, string>>({})
  const [shopifyVisibility, setShopifyVisibility] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchProducts()
  }, [])

  // Log whenever matches change
  useEffect(() => {
    console.log('Matches updated:', {
      totalMatches: Object.keys(matches).length,
      matches: matches
    })
  }, [matches])

  // Fetch both MongoDB and Shopify products
  const fetchProducts = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch MongoDB products
      const mongoResponse = await fetch('/api/products')
      if (!mongoResponse.ok) throw new Error('Failed to fetch MongoDB products')
      const mongoData = await mongoResponse.json()
      setMongoProducts(mongoData.products)

      // Fetch Shopify products
      const shopifyResponse = await fetch('/api/products/shopify/preview')
      if (!shopifyResponse.ok) throw new Error('Failed to fetch Shopify products')
      const shopifyData = await shopifyResponse.json() as ShopifyPreviewResponse
      
      // Extract just the Shopify product data we need
      const shopifyProducts = shopifyData.products.map((p: ShopifyPreviewProduct) => ({
        id: p.shopify.id,
        title: p.shopify.title,
        sku: p.shopify.sku,
        price: p.shopify.price,
        variantId: p.shopify.variantId
      }))
      setShopifyProducts(shopifyProducts)

      // Initialize matches from existing connections
      const initialMatches: Record<string, string> = {}
      shopifyData.products.forEach((p: ShopifyPreviewProduct) => {
        if (p.isExistingMatch && p.selectedMatch) {
          initialMatches[p.shopify.id] = p.selectedMatch
        }
      })
      setMatches(initialMatches)
    } catch (err) {
      console.error('Error fetching products:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch products')
    } finally {
      setLoading(false)
    }
  }

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return

    const { draggableId, destination } = result
    const mongoId = draggableId.replace('mongo-', '')
    const shopifyId = destination.droppableId.replace('shopify-', '')
    
    console.log('Creating new match:', {
      mongoId,
      shopifyId,
      mongoProduct: mongoProducts.find(p => (p._id || p.id) === mongoId)?.name,
      shopifyProduct: shopifyProducts.find(p => p.id === shopifyId)?.title
    })

    setMatches(prev => ({
      ...prev,
      [shopifyId]: mongoId
    }))

    // Reset all search filters
    setSearchTerm('')
    setShopifyVisibility({})
  }

  // Memoize the search handler to prevent unnecessary re-renders
  const handleProductSearch = (productId: string, term: string) => {
    // Update visibility of Shopify products based on search term
    const newVisibility: Record<string, boolean> = {}
    shopifyProducts.forEach(product => {
      const searchTerm = term.toLowerCase()
      const isVisible = 
        product.title.toLowerCase().includes(searchTerm) ||
        (product.sku || '').toLowerCase().includes(searchTerm)
      newVisibility[product.id] = isVisible
    })
    setShopifyVisibility(newVisibility)
  }

  const handleSync = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/products/sync/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches })
      })

      if (!response.ok) {
        throw new Error('Failed to sync products')
      }

      // Refresh the products list
      await fetchProducts()

      if (onSuccess) {
        await onSuccess()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync products')
    } finally {
      setLoading(false)
    }
  }

  // Get matched product pairs
  const matchedPairs = Object.entries(matches).map(([shopifyId, mongoId]) => {
    const shopifyProduct = shopifyProducts.find(p => p.id === shopifyId)
    const mongoProduct = mongoProducts.find(p => (p._id || p.id) === mongoId)
    return { shopifyProduct, mongoProduct }
  }).filter((pair): pair is { shopifyProduct: ShopifyProduct, mongoProduct: Product } => 
    pair.shopifyProduct !== undefined && pair.mongoProduct !== undefined
  )

  // Get unmatched products and sort them by similarity
  const unmatchedMongoProducts = mongoProducts.filter(p => 
    !Object.values(matches).includes(p._id || p.id)
  );

  const unmatchedShopifyProducts = shopifyProducts.filter(p => 
    !Object.keys(matches).includes(p.id)
  );

  // Sort unmatched MongoDB products by similarity to Shopify products
  const sortedMongoProducts = sortByMostSimilar(unmatchedMongoProducts, unmatchedShopifyProducts);

  // Filter sorted MongoDB products by search term
  const filteredMongoProducts = sortedMongoProducts.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.sku?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  // Sort Shopify products based on similarity to the filtered MongoDB products
  const sortedShopifyProducts = [...unmatchedShopifyProducts].sort((a, b) => {
    const aMaxSimilarity = Math.max(...filteredMongoProducts.map(mp => calculateSimilarity(mp.name, a.title)));
    const bMaxSimilarity = Math.max(...filteredMongoProducts.map(mp => calculateSimilarity(mp.name, b.title)));
    return bMaxSimilarity - aMaxSimilarity;
  });

  return (
    <StrictMode>
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold">Match Shopify Products</h2>
            <p className="text-sm text-gray-500 mt-1">
              {matchedPairs.length} products matched, {unmatchedMongoProducts.length} MongoDB and {unmatchedShopifyProducts.length} Shopify products remaining
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={fetchProducts}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh Products'}
            </Button>
            <Button
              onClick={handleSync}
              disabled={loading || Object.keys(matches).length === 0}
            >
              {loading ? 'Syncing...' : `Sync ${Object.keys(matches).length} Matches`}
            </Button>
          </div>
        </div>

        {error && (
          <div className="text-red-600 mb-4">{error}</div>
        )}

        {/* Matched Products Section */}
        {matchedPairs.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-4">Matched Products</h3>
            <div className="space-y-4">
              {matchedPairs.map(({ mongoProduct, shopifyProduct }) => (
                <MatchedProductPair
                  key={`${mongoProduct._id}-${shopifyProduct.id}`}
                  mongoProduct={mongoProduct}
                  shopifyProduct={shopifyProduct}
                />
              ))}
            </div>
          </div>
        )}

        {/* Unmatched Products Section */}
        {(unmatchedMongoProducts.length > 0 || unmatchedShopifyProducts.length > 0) && (
          <div>
            <h3 className="text-lg font-medium mb-4">Match Remaining Products</h3>
            <div className="mb-4">
              <Input
                placeholder="Search MongoDB products..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h4 className="font-medium text-gray-500 mb-4">MongoDB Products ({unmatchedMongoProducts.length})</h4>
                  <ProductList
                    products={filteredMongoProducts}
                    matches={matches}
                    onSearch={handleProductSearch}
                  />
                </div>
                <div>
                  <h4 className="font-medium text-gray-500 mb-4">Shopify Products ({unmatchedShopifyProducts.length})</h4>
                  <ShopifyProductList
                    products={sortedShopifyProducts}
                    matches={matches}
                    visibilityFilter={shopifyVisibility}
                  />
                </div>
              </div>
            </DragDropContext>
          </div>
        )}
      </Card>
    </StrictMode>
  )
} 