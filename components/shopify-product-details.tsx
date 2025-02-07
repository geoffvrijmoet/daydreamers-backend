'use client'

import { useState, useEffect } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Product } from '@/types'

interface ShopifyProductDetailsProps {
  product: Product
  onUpdate: () => void
}

interface ShopifyData {
  id: string
  title: string
  body_html: string
  vendor: string
  product_type: string
  tags: string[]
  variants: Array<{
    id: string
    title: string
    price: string
    compare_at_price: string | null
    barcode: string | null
    weight: number
    weight_unit: string
    requires_shipping: boolean
    taxable: boolean
    inventory_quantity: number
    options: Array<{
      name: string
      value: string
    }>
  }>
  status: string
  published_at: string | null
}

// Helper to extract numeric ID from Shopify GID
const extractShopifyId = (gid: string | undefined): string | null => {
  if (!gid) return null
  const match = gid.match(/\/ProductVariant\/(\d+)/)
  return match ? match[1] : null
}

export function ShopifyProductDetails({ product, onUpdate }: ShopifyProductDetailsProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [shopifyData, setShopifyData] = useState<ShopifyData | null>(null)
  const [formData, setFormData] = useState<ShopifyData | null>(null)

  useEffect(() => {
    if (product.shopifyId) {
      fetchShopifyData()
    }
  }, [product.shopifyId])

  const fetchShopifyData = async () => {
    if (!product.shopifyId) return

    try {
      const variantId = extractShopifyId(product.shopifyId)
      if (!variantId) {
        throw new Error('Invalid Shopify ID format')
      }

      const response = await fetch(`/api/products/${product.id || product._id}/shopify?variantId=${variantId}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch Shopify data')
      }
      const data = await response.json()
      setShopifyData(data)
      setFormData(data)
    } catch (err) {
      console.error('Error fetching Shopify data:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch Shopify data')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData || !product.shopifyId) return

    setLoading(true)
    setError(null)

    try {
      const variantId = extractShopifyId(product.shopifyId)
      if (!variantId) {
        throw new Error('Invalid Shopify ID format')
      }

      const response = await fetch(`/api/products/${product.id || product._id}/shopify?variantId=${variantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update Shopify product')
      }

      await fetchShopifyData()
      setEditing(false)
      onUpdate()
    } catch (err) {
      console.error('Error updating Shopify data:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div>Loading Shopify data...</div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-red-600">{error}</div>
      </Card>
    )
  }

  if (!shopifyData) {
    return (
      <Card className="p-6">
        <div>No Shopify data available</div>
      </Card>
    )
  }

  if (!editing) {
    return (
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Shopify Details</h2>
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit Shopify Details
          </Button>
        </div>

        <div className="space-y-6">
          {/* Product-level details */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Product Information</h3>
            
            <div>
              <h4 className="text-sm font-medium text-gray-500">Title</h4>
              <p className="mt-1">{shopifyData.title}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-500">Description</h4>
              <p className="mt-1 whitespace-pre-wrap">{shopifyData.body_html || 'No description'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500">Vendor</h4>
                <p className="mt-1">{shopifyData.vendor}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Product Type</h4>
                <p className="mt-1">{shopifyData.product_type}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-500">Tags</h4>
              <p className="mt-1">{shopifyData.tags.join(', ') || 'No tags'}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-500">Status</h4>
              <p className="mt-1">
                {shopifyData.status} • {shopifyData.published_at ? 'Published' : 'Not published'}
              </p>
            </div>
          </div>

          {/* Variants section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Variants</h3>
            <div className="divide-y">
              {shopifyData.variants.map(variant => (
                <div key={variant.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium">
                      {variant.title === 'Default Title' ? 'Default Variant' : variant.title}
                    </h4>
                    <div className="text-sm">
                      ID: {variant.id.split('/').pop()}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Price:</span>{' '}
                      ${Number(variant.price).toFixed(2)}
                    </div>
                    {variant.compare_at_price && (
                      <div>
                        <span className="text-gray-500">Compare at:</span>{' '}
                        ${Number(variant.compare_at_price).toFixed(2)}
                      </div>
                    )}
                  </div>

                  {variant.options && variant.options.length > 0 && (
                    <div className="mt-2 text-sm">
                      <span className="text-gray-500">Options:</span>{' '}
                      {variant.options.map(opt => `${opt.name}: ${opt.value}`).join(', ')}
                    </div>
                  )}

                  <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Inventory:</span>{' '}
                      {variant.inventory_quantity} units
                    </div>
                    <div>
                      <span className="text-gray-500">SKU:</span>{' '}
                      {variant.barcode || 'N/A'}
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Weight:</span>{' '}
                      {variant.weight} {variant.weight_unit}
                    </div>
                    <div>
                      <span className="text-gray-500">Settings:</span>{' '}
                      {variant.requires_shipping ? 'Requires shipping' : 'No shipping required'} •{' '}
                      {variant.taxable ? 'Taxable' : 'Not taxable'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    )
  }

  if (!formData) return null

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Edit Shopify Details</h2>
        <Button variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <Input
            required
            value={formData.title}
            onChange={e => setFormData(prev => prev ? { ...prev, title: e.target.value } : null)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <Textarea
            value={formData.body_html}
            onChange={e => setFormData(prev => prev ? { ...prev, body_html: e.target.value } : null)}
            className="h-32"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Price</label>
            <Input
              type="number"
              step="0.01"
              required
              value={Number(formData.variants[0]?.price || 0)}
              onChange={e => {
                if (!formData.variants[0]) return
                const newVariants = [...formData.variants]
                newVariants[0] = { ...newVariants[0], price: e.target.value }
                setFormData(prev => prev ? { ...prev, variants: newVariants } : null)
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Compare at Price</label>
            <Input
              type="number"
              step="0.01"
              value={formData.variants[0]?.compare_at_price || ''}
              onChange={e => {
                if (!formData.variants[0]) return
                const newVariants = [...formData.variants]
                newVariants[0] = { ...newVariants[0], compare_at_price: e.target.value || null }
                setFormData(prev => prev ? { ...prev, variants: newVariants } : null)
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Vendor</label>
            <Input
              required
              value={formData.vendor}
              onChange={e => setFormData(prev => prev ? { ...prev, vendor: e.target.value } : null)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Product Type</label>
            <Input
              required
              value={formData.product_type}
              onChange={e => setFormData(prev => prev ? { ...prev, product_type: e.target.value } : null)}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tags (comma separated)</label>
          <Input
            value={formData.tags.join(', ')}
            onChange={e => setFormData(prev => prev ? { ...prev, tags: e.target.value.split(',').map(t => t.trim()) } : null)}
          />
        </div>

        {error && (
          <div className="text-red-600 text-sm">{error}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Card>
  )
} 