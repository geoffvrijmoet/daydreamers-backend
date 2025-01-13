import { useState } from 'react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Loader2 } from 'lucide-react'

type SquareProduct = {
  id: string
  name: string
  description?: string
  sku?: string
  price: number
  parentId: string
}

type ReviewProduct = SquareProduct & {
  supplier: string
  category: string
  selected: boolean
}

interface SquareSyncReviewProps {
  onSuccess?: () => void
}

export function SquareSyncReview({ onSuccess }: SquareSyncReviewProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<ReviewProduct[]>([])
  const [syncing, setSyncing] = useState(false)
  const [step, setStep] = useState<'initial' | 'review'>('initial')

  // Fetch products from Square
  const fetchSquareProducts = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/products/square/preview')
      if (!response.ok) {
        throw new Error('Failed to fetch Square products')
      }
      const data = await response.json()
      
      // Transform Square products into review format
      const reviewProducts: ReviewProduct[] = data.products.map((p: SquareProduct) => ({
        ...p,
        supplier: '',
        category: '',
        selected: true
      }))
      
      setProducts(reviewProducts)
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch Square products')
    } finally {
      setLoading(false)
    }
  }

  // Update a product's review data
  const updateProduct = (id: string, field: keyof ReviewProduct, value: string | number | boolean) => {
    setProducts(prev => prev.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ))
  }

  // Handle the final sync
  const handleSync = async () => {
    setSyncing(true)
    try {
      const selectedProducts = products.filter(p => p.selected)
      const response = await fetch('/api/products/sync/square', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: selectedProducts })
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

  // Group products by parent ID
  const groupedProducts = products.reduce((groups, product) => {
    const group = groups.get(product.parentId) || []
    group.push(product)
    groups.set(product.parentId, group)
    return groups
  }, new Map<string, ReviewProduct[]>())

  if (step === 'initial') {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-medium mb-4">Sync Square Products</h2>
        <p className="text-sm text-gray-600 mb-4">
          This will fetch your Square catalog and let you review new products before adding them to your database.
        </p>
        <Button
          onClick={fetchSquareProducts}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fetching Products...
            </>
          ) : (
            'Fetch Square Products'
          )}
        </Button>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </Card>
    )
  }

  const selectedCount = products.filter(p => p.selected).length

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-medium">Review Square Products</h2>
          <p className="text-sm text-gray-600">
            {products.length} new products found
          </p>
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
              `Sync ${selectedCount} Products`
            )}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600">{error}</p>
      )}

      <div className="space-y-4">
        {Array.from(groupedProducts.entries()).map(([parentId, groupProducts]) => (
          <Card key={parentId} className="p-4">
            <div className="space-y-4">
              {/* Shared fields for the group */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={groupProducts[0].description || ''}
                  onChange={e => {
                    // Update description for all products in group
                    groupProducts.forEach(p => 
                      updateProduct(p.id, 'description', e.target.value)
                    )
                  }}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Supplier</label>
                  <Input
                    value={groupProducts[0].supplier}
                    onChange={e => {
                      // Update supplier for all products in group
                      groupProducts.forEach(p => 
                        updateProduct(p.id, 'supplier', e.target.value)
                      )
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Category</label>
                  <Input
                    value={groupProducts[0].category}
                    onChange={e => {
                      // Update category for all products in group
                      groupProducts.forEach(p => 
                        updateProduct(p.id, 'category', e.target.value)
                      )
                    }}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Individual product variations */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Variations</h3>
                <div className="space-y-4">
                  {groupProducts.map(product => (
                    <div key={product.id} className="flex items-start gap-4 bg-gray-50 p-4 rounded-md">
                      <input
                        type="checkbox"
                        checked={product.selected}
                        onChange={e => updateProduct(product.id, 'selected', e.target.checked)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Name</label>
                            <Input
                              value={product.name}
                              onChange={e => updateProduct(product.id, 'name', e.target.value)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">SKU</label>
                            <Input
                              value={product.sku || ''}
                              onChange={e => updateProduct(product.id, 'sku', e.target.value)}
                              className="mt-1"
                            />
                          </div>
                        </div>

                        <div className="text-sm text-gray-600">
                          Price: ${product.price.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Card>
  )
} 