'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Product } from '@/types'
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Search, X } from 'lucide-react'
import type { ShopifySearchResult } from '@/types/shopify'

interface CreateShopifyProductFormProps {
  product: Product
  variants?: Product[]
  onSuccess: () => void
}

interface VariantData {
  title: string
  price: number
  compareAtPrice: number | null
  barcode: string
  sku: string
  weight: number
  weightUnit: string
  requiresShipping: boolean
  taxable: boolean
  cost: number
}

interface FormData {
  title: string
  description: string
  vendor: string
  productType: string
  tags: string
  variants: VariantData[]
  images: File[]
  imageOrder: string[]
  existingImages: Array<{
    id: string
    url: string
    width?: number
    height?: number
    altText?: string
  }>
}

interface ShopifyResponse {
  id: string
  error?: string
}

export function CreateShopifyProductForm({ product, variants = [], onSuccess }: CreateShopifyProductFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  
  const [mode, setMode] = useState<'new' | 'variant'>('new')
  const [showForm, setShowForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<ShopifySearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ShopifySearchResult | null>(null)
  
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    vendor: '',
    productType: '',
    tags: '',
    variants: [],
    images: [],
    imageOrder: [],
    existingImages: []
  });

  // Move form data initialization to useEffect
  useEffect(() => {
    // Get base product name (everything before the first dash)
    const baseProductName = product.name.split(' - ')[0];

    // Combine all product names into one array
    const allProductNames = [product.name, ...variants.map(v => v.name)];
    
    // Extract variant names and clean them up
    const variantNames = allProductNames.map(name => {
      const parts = name.split(' - ');
      // If there's a part after the dash, use it, otherwise use the full name
      return parts.length > 1 ? parts[1] : parts[0];
    });

    // Create variant data from the names
    const variantData = variantNames.map((name, index) => {
      const sourceProduct = index === 0 ? product : variants[index - 1];
      
      // Handle proxy relationships for cost and weight
      let variantCost = sourceProduct.lastPurchasePrice;
      let variantWeight = 0;  // Default weight

      if (sourceProduct.proxyOf) {
        const proxyTarget = variants.find(v => v._id === sourceProduct.proxyOf);
        if (proxyTarget) {
          variantCost = proxyTarget.lastPurchasePrice / (sourceProduct.proxyRatio || 1);
          variantWeight = (proxyTarget as { weight?: number }).weight ? 
            (proxyTarget as { weight?: number }).weight! / (sourceProduct.proxyRatio || 1) : 0;
        }
      }

      return {
        title: name,
        price: sourceProduct.retailPrice,
        compareAtPrice: null,
        barcode: '',
        sku: sourceProduct.sku || '',
        weight: variantWeight,
        weightUnit: 'lb',
        requiresShipping: true,
        taxable: true,
        cost: variantCost
      };
    });

    setFormData(prev => ({
      ...prev,
      title: baseProductName,
      description: product.description || '',
      vendor: product.supplier || '',
      productType: product.category || '',
      variants: variantData
    }));
  }, [product, variants]);

  // Disable unused variable warnings for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newImageIds = files.map(() => `new-${Date.now()}-${Math.random()}`)
    
    setFormData(prev => ({
      ...prev,
      images: [...prev.images, ...files],
      imageOrder: [...prev.imageOrder, ...newImageIds]
    }))
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    try {
      // Format description with preset sections
      const formattedDescription = `
        <h6>Description</h6>
        ${formData.description || 'No description available.'}
        <h6>Ingredients</h6>
        To be added.
      `.trim();

      // Create the main product with all variants
      const response = await fetch(`/api/products/${product.id}/shopify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'product',
          title: formData.title,
          description: formattedDescription,
          vendor: formData.vendor,
          productType: formData.productType,
          tags: formData.tags,
          variants: formData.variants.map(variant => ({
            title: variant.title,
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            barcode: variant.barcode,
            sku: variant.sku,
            weight: variant.weight,
            weightUnit: variant.weightUnit,
            requiresShipping: variant.requiresShipping,
            taxable: variant.taxable,
            cost: variant.cost
          }))
        })
      })

      if (!response.ok) {
        const error = await response.json() as ShopifyResponse
        throw new Error(error.error || 'Failed to create Shopify product')
      }

      onSuccess()
    } catch (err) {
      console.error('Error creating Shopify product:', err)
      setError(err instanceof Error ? err.message : 'Failed to create Shopify product')
    } finally {
      setLoading(false)
    }
  }
  const handleVariantChange = (index: number, field: keyof VariantData, value: string | number | boolean | null) => {
    setFormData(prev => {
      const newVariants = [...prev.variants];
      const sourceProduct = index === 0 ? product : variants[index - 1];
      
      if (field === 'cost' && sourceProduct.proxyOf) {
        // If changing cost of a proxy product, update all related proxies
        const proxyTarget = variants.find(v => v._id === sourceProduct.proxyOf);
        if (proxyTarget) {
          const proxyRatio = sourceProduct.proxyRatio || 1;
          const newProxyTargetCost = Number(value) * proxyRatio;
          
          // Update costs for all variants that are proxies of the same target
          newVariants.forEach((variant, i) => {
            const variantProduct = i === 0 ? product : variants[i - 1];
            if (variantProduct.proxyOf === sourceProduct.proxyOf) {
              const variantRatio = variantProduct.proxyRatio || 1;
              newVariants[i] = {
                ...variant,
                cost: newProxyTargetCost / variantRatio
              };
            }
          });
        }
      } else if (field === 'compareAtPrice') {
        // Handle compareAtPrice separately to avoid type issues
        newVariants[index] = {
          ...newVariants[index],
          compareAtPrice: value === '' ? null : Number(value)
        };
      } else {
        newVariants[index] = {
          ...newVariants[index],
          [field]: value
        };
      }
      
      return {
        ...prev,
        variants: newVariants
      };
    });
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

            if (newMode === 'variant') {
              const parts = formData.title.split(' - ');
              if (parts.length > 1) {
                setFormData(prev => ({ ...prev, title: parts[parts.length - 1] }));
              } else {
                setFormData(prev => ({ ...prev, title: '' }));
              }
            } else {
              setFormData(prev => ({ ...prev, title: product.name.split(' - ')[0] }));
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {mode === 'variant' ? (
          <div className="space-y-4">
            <div className="relative">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Search for existing product..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    searchProducts(e.target.value);
                  }}
                  className="flex-1"
                />
                <Button type="button" variant="outline" disabled={searching}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              
              {searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      className="w-full px-4 py-2 text-left hover:bg-gray-100"
                      onClick={() => {
                        setSelectedProduct(result);
                        setSearchTerm(result.title);
                        setSearchResults([]);
                      }}
                    >
                      {result.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
              />
            </div>
            
            <div>
              <Label htmlFor="vendor">Vendor</Label>
              <Input
                id="vendor"
                value={formData.vendor}
                onChange={(e) => setFormData(prev => ({ ...prev, vendor: e.target.value }))}
              />
            </div>
            
            <div>
              <Label htmlFor="productType">Product Type</Label>
              <Input
                id="productType"
                value={formData.productType}
                onChange={(e) => setFormData(prev => ({ ...prev, productType: e.target.value }))}
              />
            </div>
            
            <div>
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="tag1, tag2, tag3"
              />
            </div>
          </div>
        )}

        <div className="space-y-6">
          <h3 className="text-lg font-semibold">Variants</h3>
          {formData.variants.map((variant, index) => {
            return (
              <Card key={index} className="p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Variant {index + 1}</h4>
                  {formData.variants.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          variants: prev.variants.filter((_, i) => i !== index)
                        }))
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`variant-${index}-title`}>Title</Label>
                    <Input
                      id={`variant-${index}-title`}
                      value={variant.title}
                      onChange={(e) => handleVariantChange(index, 'title', e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor={`variant-${index}-sku`}>SKU</Label>
                    <Input
                      id={`variant-${index}-sku`}
                      value={variant.sku}
                      onChange={(e) => handleVariantChange(index, 'sku', e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`variant-${index}-price`}>Price</Label>
                    <Input
                      id={`variant-${index}-price`}
                      type="number"
                      step="0.01"
                      value={variant.price}
                      onChange={(e) => handleVariantChange(index, 'price', parseFloat(e.target.value))}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor={`variant-${index}-compareAtPrice`}>Compare at Price</Label>
                    <input
                      type="number"
                      className="border-gray-300 rounded-md shadow-sm w-full"
                      id={`variant-${index}-compareAtPrice`}
                      placeholder="Compare at price"
                      min="0"
                      step="0.01"
                      value={variant.compareAtPrice || ''}
                      onChange={(e) => handleVariantChange(
                        index, 
                        'compareAtPrice', 
                        e.target.value ? parseFloat(e.target.value) : null
                      )}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`variant-${index}-cost`}>Cost</Label>
                    <Input
                      id={`variant-${index}-cost`}
                      type="number"
                      step="0.01"
                      value={variant.cost}
                      onChange={(e) => handleVariantChange(index, 'cost', parseFloat(e.target.value))}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`variant-${index}-barcode`}>Barcode</Label>
                    <Input
                      id={`variant-${index}-barcode`}
                      value={variant.barcode}
                      onChange={(e) => handleVariantChange(index, 'barcode', e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`variant-${index}-weight`}>Weight</Label>
                    <Input
                      id={`variant-${index}-weight`}
                      type="number"
                      step="0.01"
                      value={variant.weight}
                      onChange={(e) => handleVariantChange(index, 'weight', parseFloat(e.target.value))}
                    />
                  </div>

                  <div>
                    <Label htmlFor={`variant-${index}-weightUnit`}>Weight Unit</Label>
                    <select
                      id={`variant-${index}-weightUnit`}
                      value={variant.weightUnit}
                      onChange={(e) => handleVariantChange(index, 'weightUnit', e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    >
                      <option value="lb">lb</option>
                      <option value="oz">oz</option>
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                    </select>
                  </div>

                  <div className="col-span-2 flex gap-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`variant-${index}-requiresShipping`}
                        checked={variant.requiresShipping}
                        onChange={(e) => handleVariantChange(index, 'requiresShipping', e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <Label htmlFor={`variant-${index}-requiresShipping`}>Requires Shipping</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`variant-${index}-taxable`}
                        checked={variant.taxable}
                        onChange={(e) => handleVariantChange(index, 'taxable', e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <Label htmlFor={`variant-${index}-taxable`}>Taxable</Label>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        {error && (
          <div className="text-red-500 text-sm">{error}</div>
        )}

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowForm(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || (mode === 'variant' && !selectedProduct)}
          >
            {loading ? 'Creating...' : 'Create Product'}
          </Button>
        </div>
      </form>
    </Card>
  )
} 