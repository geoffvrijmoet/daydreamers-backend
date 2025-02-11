'use client'

import { useState, useCallback } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Product } from '@/types'
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Search, Upload, X } from 'lucide-react'

interface CreateShopifyProductFormProps {
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
  sku: string
  weight: number
  weightUnit: 'lb' | 'oz' | 'kg' | 'g'
  requiresShipping: boolean
  taxable: boolean
  existingProductId?: string
  images: File[]
  cost: number
  existingImages: Array<{
    id: string
    url: string
    width?: number
    height?: number
    altText?: string
  }>
  imageOrder: string[] // Array of image IDs in display order
}

interface ShopifySearchResult {
  id: string
  title: string
  variants: Array<{
    id: string
    title: string
    sku?: string
  }>
}

export function CreateShopifyProductForm({ product, onSuccess, existingShopifyProduct }: CreateShopifyProductFormProps & {
  existingShopifyProduct?: {
    images: Array<{
      id: string
      url: string
      width?: number
      height?: number
      altText?: string
    }>
  }
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'new' | 'variant'>('new')
  const [showForm, setShowForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<ShopifySearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ShopifySearchResult | null>(null)
  
  const [formData, setFormData] = useState<ShopifyProductData>({
    title: product.name,
    description: product.description || '',
    vendor: product.supplier || 'Daydreamers Pet Supply',
    productType: product.category || 'Pet Supplies',
    tags: '',
    price: product.retailPrice,
    compareAtPrice: undefined,
    barcode: product.barcode,
    sku: product.sku || '',
    weight: 0,
    weightUnit: 'lb',
    requiresShipping: true,
    taxable: true,
    existingProductId: '',
    images: [],
    cost: product.lastPurchasePrice || 0,
    existingImages: existingShopifyProduct?.images || [],
    imageOrder: existingShopifyProduct?.images.map(img => img.id) || []
  })

  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)

  const searchProducts = async (term: string) => {
    if (!term) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const response = await fetch(`/api/products/shopify/search?query=${encodeURIComponent(term)}`)
      if (!response.ok) throw new Error('Failed to search products')
      const data = await response.json()
      setSearchResults(data.products)
    } catch (err) {
      console.error('Error searching products:', err)
      setError(err instanceof Error ? err.message : 'Failed to search products')
    } finally {
      setSearching(false)
    }
  }

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newImageIds = files.map(() => `new-${Date.now()}-${Math.random()}`)
    
    setFormData(prev => ({
      ...prev,
      images: [...prev.images, ...files],
      imageOrder: [...prev.imageOrder, ...newImageIds]
    }))
  }, [])

  const removeImage = useCallback((index: number, isExisting: boolean) => {
    setFormData(prev => {
      if (isExisting) {
        const imageId = prev.existingImages[index].id
        return {
          ...prev,
          existingImages: prev.existingImages.filter((_, i) => i !== index),
          imageOrder: prev.imageOrder.filter(id => id !== imageId)
        }
      } else {
        const imageToRemove = prev.images[index]
        const newImageId = prev.imageOrder.find(id => 
          id.startsWith('new-') && !prev.images.slice(0, index).some((_, i) => 
            prev.imageOrder.indexOf(`new-${i}`) === prev.imageOrder.indexOf(id)
          )
        )
        return {
          ...prev,
          images: prev.images.filter((_, i) => i !== index),
          imageOrder: prev.imageOrder.filter(id => id !== newImageId)
        }
      }
    })
  }, [])

  const moveImage = useCallback((dragIndex: number, dropIndex: number) => {
    setFormData(prev => {
      const newOrder = [...prev.imageOrder]
      const [movedId] = newOrder.splice(dragIndex, 1)
      newOrder.splice(dropIndex, 0, movedId)
      return {
        ...prev,
        imageOrder: newOrder
      }
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setIsUploading(true)
    setUploadProgress(0)

    try {
      // First, upload and convert new images if there are any
      let newImageIds: string[] = []
      if (formData.images.length > 0) {
        const formDataWithImages = new FormData()
        formData.images.forEach((image) => {
          formDataWithImages.append('images', image)
        })

        const uploadResponse = await fetch('/api/products/shopify/images', {
          method: 'POST',
          body: formDataWithImages
        })

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload images')
        }

        const uploadResult = await uploadResponse.json()
        newImageIds = uploadResult.imageIds
      }

      // Combine existing and new image IDs in the correct order
      const orderedImageIds = formData.imageOrder.map(id => {
        if (id.startsWith('new-')) {
          const newIndex = formData.imageOrder.filter(i => i.startsWith('new-')).indexOf(id)
          return newImageIds[newIndex]
        }
        return id
      })

      // Then create/update the product with image IDs
      const response = await fetch(`/api/products/${product._id}/shopify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          mode,
          existingProductId: selectedProduct?.id,
          imageIds: orderedImageIds
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create Shopify product')
      }

      const data = await response.json()
      setShowForm(false)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  if (!showForm) {
    return (
      <Button 
        variant="outline" 
        onClick={() => setShowForm(true)}
        className="w-full"
      >
        Create Shopify Product
      </Button>
    )
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">Create Shopify Product</h2>
      
      <div className="mb-6">
        <RadioGroup 
          value={mode} 
          onValueChange={(value) => {
            const newMode = value as 'new' | 'variant';
            setMode(newMode);
            setSelectedProduct(null);
            setSearchTerm('');
            setSearchResults([]);

            // When switching to variant mode, try to extract the variant name
            if (newMode === 'variant') {
              const parts = formData.title.split(' - ');
              if (parts.length > 1) {
                // If title contains " - ", use the last part as variant name
                setFormData(prev => ({ ...prev, title: parts[parts.length - 1] }));
              } else {
                // If no " - " found, clear the title
                setFormData(prev => ({ ...prev, title: '' }));
              }
            } else {
              // When switching back to new mode, restore original product name
              setFormData(prev => ({ ...prev, title: product.name }));
            }
          }}
          className="flex flex-col space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="new" id="new" />
            <Label htmlFor="new">Create as new product</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="variant" id="variant" />
            <Label htmlFor="variant">Add as variant to existing product</Label>
          </div>
        </RadioGroup>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'variant' ? (
          <div className="space-y-4">
            <div className="relative">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Search for a product..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      searchProducts(e.target.value)
                    }}
                    className="pr-8"
                  />
                </div>
                <Button 
                  type="button"
                  variant="outline"
                  onClick={() => searchProducts(searchTerm)}
                  disabled={searching}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              
              {searchResults.length > 0 && !selectedProduct && (
                <div className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg border border-gray-200 max-h-60 overflow-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => {
                        setSelectedProduct(result)
                        setSearchTerm(result.title)
                        setSearchResults([])
                        
                        // Get the base SKU from the parent product's first variant
                        const baseShopifySku = result.variants[0]?.sku || '';
                        // If there's a base SKU, append a suffix, otherwise use the MongoDB SKU
                        const newSku = baseShopifySku ? `${baseShopifySku}-${formData.title.toLowerCase()}` : formData.sku;
                        
                        setFormData(prev => ({
                          ...prev,
                          existingProductId: result.id,
                          sku: newSku
                        }))
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100"
                    >
                      <div>{result.title}</div>
                      <div className="text-sm text-gray-500">
                        {result.variants.length} variant(s)
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedProduct && (
              <div className="p-4 bg-gray-50 rounded-md">
                <div className="font-medium">Selected Product:</div>
                <div>{selectedProduct.title}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedProduct(null)
                    setSearchTerm('')
                  }}
                  className="mt-2"
                >
                  Change Selection
                </Button>
              </div>
            )}
          </div>
        ) : null}

        <div>
          <label className="block text-sm font-medium mb-1">
            {mode === 'new' ? 'Title' : 'Variant Title'}
          </label>
          {mode === 'new' ? (
            <Input
              required
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
            />
          ) : (
            <>
              <Input
                required
                placeholder="e.g. Single, Large, Blue, etc."
                value={formData.title}
                onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              />
              <p className="text-sm text-gray-500 mt-1">
                Full variant title will be: {selectedProduct?.title} - {formData.title}
              </p>
            </>
          )}
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
            <label className="block text-sm font-medium mb-1">Cost</label>
            <Input
              type="number"
              step="0.01"
              required
              value={formData.cost}
              onChange={e => setFormData(prev => ({ ...prev, cost: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
            <label className="block text-sm font-medium mb-1">Barcode</label>
            <Input
              value={formData.barcode || ''}
              onChange={e => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">SKU</label>
            <Input
              value={formData.sku}
              onChange={e => setFormData(prev => ({ ...prev, sku: e.target.value }))}
              placeholder="Enter SKU"
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

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Product Images</label>
            <div className="grid grid-cols-4 gap-4 mb-4">
              {formData.imageOrder.map((imageId, index) => {
                const isExisting = !imageId.startsWith('new-')
                let image
                let preview

                if (isExisting) {
                  image = formData.existingImages.find(img => img.id === imageId)
                  preview = image?.url
                } else {
                  const newIndex = formData.imageOrder
                    .filter(id => id.startsWith('new-'))
                    .indexOf(imageId)
                  image = formData.images[newIndex]
                  preview = URL.createObjectURL(image)
                }

                if (!image) return null

                return (
                  <div 
                    key={imageId} 
                    className="relative group cursor-move"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', index.toString())
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const dragIndex = parseInt(e.dataTransfer.getData('text/plain'))
                      moveImage(dragIndex, index)
                    }}
                  >
                    <img
                      src={preview}
                      alt={`Product image ${index + 1}`}
                      className="w-full aspect-square object-cover rounded-md"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(isExisting ? formData.existingImages.findIndex(img => img.id === imageId) : 
                        formData.images.findIndex((_, i) => 
                          formData.imageOrder.indexOf(`new-${i}`) === formData.imageOrder.indexOf(imageId)
                        ), isExisting)}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('image-upload')?.click()}
                disabled={isUploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                Add Images
              </Button>
              <input
                id="image-upload"
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              {isUploading && (
                <div className="flex-1">
                  <div className="h-2 bg-gray-200 rounded-full">
                    <div
                      className="h-2 bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="text-red-600 text-sm">{error}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={loading || (mode === 'variant' && !selectedProduct)}
          >
            {loading ? 'Creating...' : mode === 'new' ? 'Create Product' : 'Add Variant'}
          </Button>
        </div>
      </form>
    </Card>
  )
} 