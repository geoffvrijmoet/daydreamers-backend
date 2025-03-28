'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Product } from '@/types'

interface ShopifyProductFormProps {
  product: Product
  onSuccess?: () => void
}

interface ShopifyProductData {
  title: string
  description: string
  vendor: string
  productType: string
  tags: string
  price: number
  compareAtPrice?: number
  barcode?: string
  weight: number
  weightUnit: 'lb' | 'oz' | 'kg' | 'g'
  requiresShipping: boolean
  taxable: boolean
}

export function ShopifyProductForm({ product, onSuccess }: ShopifyProductFormProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<ShopifyProductData>({
    title: product.name,
    description: product.description || '',
    vendor: product.supplier || 'Daydreamers Pet Supply',
    productType: product.category || 'Pet Supplies',
    tags: '',
    price: product.price,
    compareAtPrice: undefined,
    barcode: product.barcode,
    weight: 0,
    weightUnit: 'lb',
    requiresShipping: true,
    taxable: true
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/products/${product.id}/shopify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        throw new Error('Failed to create Shopify product')
      }


      setOpen(false)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Push to Shopify</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Shopify Product</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <Input
              required
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Textarea
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="h-32"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Vendor</label>
              <Input
                required
                value={formData.vendor}
                onChange={e => setFormData(prev => ({ ...prev, vendor: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Product Type</label>
              <Input
                required
                value={formData.productType}
                onChange={e => setFormData(prev => ({ ...prev, productType: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Tags (comma separated)</label>
            <Input
              value={formData.tags}
              onChange={e => setFormData(prev => ({ ...prev, tags: e.target.value }))}
              placeholder="e.g. dog, treats, organic"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Price</label>
              <Input
                type="number"
                step="0.01"
                required
                value={formData.price}
                onChange={e => setFormData(prev => ({ ...prev, price: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Compare at Price</label>
              <Input
                type="number"
                step="0.01"
                value={formData.compareAtPrice || ''}
                onChange={e => setFormData(prev => ({ ...prev, compareAtPrice: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Weight</label>
              <Input
                type="number"
                step="0.01"
                required
                value={formData.weight}
                onChange={e => setFormData(prev => ({ ...prev, weight: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Weight Unit</label>
              <select
                value={formData.weightUnit}
                onChange={e => setFormData(prev => ({ ...prev, weightUnit: e.target.value as 'lb' | 'oz' | 'kg' | 'g' }))}
                className="w-full rounded-md border-gray-300"
              >
                <option value="lb">Pounds (lb)</option>
                <option value="oz">Ounces (oz)</option>
                <option value="kg">Kilograms (kg)</option>
                <option value="g">Grams (g)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.requiresShipping}
                onChange={e => setFormData(prev => ({ ...prev, requiresShipping: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Requires Shipping</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.taxable}
                onChange={e => setFormData(prev => ({ ...prev, taxable: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Taxable</span>
            </label>
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Product'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
} 