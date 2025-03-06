'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from "@/components/ui/card"
import { Product } from '@/types'
import { CreateShopifyProductForm } from '@/components/create-shopify-product-form'
import { Button } from "@/components/ui/button"
import { calculateProfitPerUnit, getPreTaxPrice } from '@/lib/utils/pricing'

interface EditableField {
  id: string
  field: string
  value: string | number
  originalValue: string | number
}

export default function ProductEdit({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [variants, setVariants] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const [shopifyProductExists, setShopifyProductExists] = useState<boolean | null>(null)

  const fetchProduct = useCallback(async () => {
    try {
      const response = await fetch(`/api/products/${params.id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch product')
      }
      const data = await response.json()
      setProduct(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch product')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  const fetchVariants = useCallback(async () => {
    try {
      const response = await fetch(`/api/products/${params.id}/variants`)
      if (!response.ok) {
        throw new Error('Failed to fetch variants')
      }
      const data = await response.json()
      setVariants(data.variants || [])
    } catch (err) {
      console.error('Error fetching variants:', err)
    }
  }, [params.id])
  const checkShopifyProduct = useCallback(async (shopifyId: string) => {
    try {
      // Extract just the numeric ID from the Shopify ID
      const numericId = shopifyId.replace(/^gid:\/\/shopify\/(Product|ProductVariant)\//, '')
                                .replace(/[^\d]/g, '')
      
      const response = await fetch(`/api/products/shopify/${numericId}/check`)
      if (!response.ok) {
        throw new Error('Failed to check Shopify product')
      }
      const data = await response.json()
      setShopifyProductExists(data.exists)
    } catch (err) {
      console.error('Error checking Shopify product:', err)
      setShopifyProductExists(false)
    }
  }, [])

  useEffect(() => {
    fetchProduct()
    fetchVariants()
  }, [fetchProduct, fetchVariants])

  useEffect(() => {
    if (product?.shopifyId) {

      checkShopifyProduct(product.shopifyId)
    } else if (product?.shopifyVariantId) {

      checkShopifyProduct(`gid://shopify/ProductVariant/${product.shopifyVariantId}`)
    }
  }, [product?.shopifyId, product?.shopifyVariantId, checkShopifyProduct])

  const handleUpdateField = async (productId: string, field: string, value: string | number) => {
    try {
      // Find the product being updated
      const targetProduct = allProducts.find(p => p.id === productId);
      if (!targetProduct) return;

      // Fields that should be synced in proxy relationships
      const syncedFields = ['lastPurchasePrice', 'currentStock', 'weight', 'profitPerUnit', 'averageCost'];
      
      if (syncedFields.includes(field) && (targetProduct.proxyOf || targetProduct.isProxied)) {
        // If this product is a proxy of another
        if (targetProduct.proxyOf) {
          const proxyTarget = allProducts.find(p => p._id === targetProduct.proxyOf);
          if (proxyTarget) {
            const ratio = targetProduct.proxyRatio || 1;
            // Update the proxy target with the scaled value
            await fetch(`/api/products/${proxyTarget._id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                [field]: typeof value === 'number' ? value * ratio : value 
              })
            });
          }
        }
        // If this product is being proxied by others
        if (targetProduct.isProxied) {
          const proxyProducts = allProducts.filter(p => p.proxyOf === targetProduct._id);
          // Update all proxy products with their scaled values
          await Promise.all(proxyProducts.map(proxy => 
            fetch(`/api/products/${proxy._id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                [field]: typeof value === 'number' ? value / (proxy.proxyRatio || 1) : value 
              })
            })
          ));
        }
      }

      // Update the original product
      const response = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });

      if (!response.ok) {
        throw new Error('Failed to update product')
      }

      // Refresh the product and variants data
      await Promise.all([fetchProduct(), fetchVariants()]);
      setEditingField(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update product');
    }
  }

  const EditableValue = ({ 
    label, 
    value, 
    productId, 
    field, 
    type = 'text',
    format = 'text',
    className = '',
    showPreTax = false
  }: { 
    label: string
    value: string | number
    productId: string
    field: string
    type?: 'text' | 'number'
    format?: 'text' | 'number' | 'currency'
    className?: string
    showPreTax?: boolean
  }) => {
    const isEditing = editingField?.id === productId && editingField?.field === field
    const preTaxValue = type === 'number' && typeof value === 'number' ? getPreTaxPrice(value) : null
    return (
      <div className={className}>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {isEditing ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              type={type}
              step={type === 'number' ? '0.01' : undefined}
              value={editingField.value}
              autoFocus
              onChange={e => setEditingField({
                ...editingField,
                value: type === 'number' ? Number(e.target.value) : e.target.value
              })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <button
              onClick={() => handleUpdateField(productId, field, editingField.value)}
              className="text-sm text-green-600 hover:text-green-700"
            >
              Save
            </button>
            <button
              onClick={() => setEditingField(null)}
              className="text-sm text-gray-500 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="mt-1 text-sm text-gray-900 cursor-pointer hover:bg-gray-50 p-1 rounded"
          onClick={(e) => {
            e.stopPropagation();
            setEditingField({
              id: productId,
              field,
              value: value,
              originalValue: value
            });
          }}
          >
            {type === 'number' && typeof value === 'number' ? (
              <div>
                {format === 'currency' ? `$${value.toFixed(2)}` : value}
                {showPreTax && preTaxValue !== null && (
                  <p className="text-xs text-gray-500">Pre-tax: ${preTaxValue.toFixed(2)}</p>
                )}
              </div>
            ) : (
              <div 
              className="relative z-50 mt-1 text-sm text-gray-900 cursor-pointer hover:bg-gray-50 p-1 rounded"

                
              >
                {value || 'Not set'}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Add warning message if Shopify product doesn't exist
  const ShopifyWarning = () => {
    if (!product?.shopifyId || shopifyProductExists === null) return null
    
    return !shopifyProductExists ? (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              This product no longer exists in Shopify. It may have been deleted or archived.
            </p>
          </div>
        </div>
      </div>
    ) : null
  }

  if (loading) {
    return <div>Loading...</div>
  }

  if (error) {
    return <div className="text-red-600">{error}</div>
  }

  if (!product) {
    return <div>Product not found</div>
  }

  const isVariant = product.shopifyParentId || product.squareParentId;
  // Instead of filtering out the current product, get all products with the same squareParentId
  const allProducts = variants.filter(v => v.squareParentId === product.squareParentId);

    // If this is the parent product, include it in allProducts
    allProducts.unshift(product);

  const baseProduct = isVariant ? variants.find(v => !v.shopifyParentId && !v.squareParentId) || product : product;
  const baseProductName = baseProduct.name.split(' - ')[0];
  console.log(allProducts)

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <ShopifyWarning />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">
          {baseProductName}
        </h1>
        <div className="flex gap-2">
          {!isVariant && (
            <Button
              variant="outline"
              onClick={() => router.push(`/products/${params.id}/variants/new`)}
            >
              Add Variant
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => router.push('/products')}
          >
            Back to Products
          </Button>
        </div>
      </div>

      <Card className="p-6">
        {/* Base Product Information */}
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-medium mb-4">Product Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <EditableValue
                label="Description"
                value={baseProduct.description || ''}
                productId={baseProduct.id}
                field="description"
              />
              <EditableValue
                label="Category"
                value={baseProduct.category || ''}
                productId={baseProduct.id}
                field="category"
              />
              <EditableValue
                label="Supplier"
                value={baseProduct.supplier || ''}
                productId={baseProduct.id}
                field="supplier"
              />
            </div>

            {/* Add Proxy Management Section */}
            <div className="mt-6 border-t pt-6">
              <h3 className="text-lg font-medium mb-4">Proxy Management</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">Product A</label>
                    <p className="mt-1 text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {product.name}
                    </p>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!product.proxyOf) return;
                        const currentTarget = variants.find(v => v._id === product.proxyOf);
                        if (!currentTarget) return;
                        
                        try {
                          // Switch the proxy relationship
                          const response = await fetch(`/api/products/${currentTarget._id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              proxyOf: product._id,
                              proxyRatio: 1 / (product.proxyRatio || 1)
                            })
                          });
                          
                          if (!response.ok) throw new Error('Failed to switch proxy relationship');

                          // Remove proxy relationship from current product
                          const removeResponse = await fetch(`/api/products/${product.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              proxyOf: null,
                              proxyRatio: null
                            })
                          });

                          if (!removeResponse.ok) throw new Error('Failed to remove proxy relationship');

                          // Navigate to the other product's page
                          router.push(`/products/${currentTarget._id}`);
                        } catch (err) {
                          console.error('Error switching proxy relationship:', err);
                        }
                      }}
                      disabled={!product.proxyOf}
                    >
                      ↑↓ Switch Direction
                    </Button>
                    <p className="text-xs text-gray-500">
                      {product.proxyOf ? 'is proxy of' : 'no relationship'}
                    </p>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">Product B</label>
                    <select
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      value={product.proxyOf || ''}
                      onChange={async (e) => {
                        const targetId = e.target.value;
                        if (!targetId) {
                          // Remove proxy relationship
                          const response = await fetch(`/api/products/${product.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              proxyOf: null,
                              proxyRatio: null
                            })
                          });
                          if (!response.ok) throw new Error('Failed to remove proxy relationship');
                        } else {
                          // Set new proxy relationship
                          const response = await fetch(`/api/products/${product.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              proxyOf: targetId,
                              proxyRatio: 1
                            })
                          });
                          if (!response.ok) throw new Error('Failed to set proxy relationship');
                        }
                        fetchProduct();
                      }}
                    >
                      <option value="">Select a product...</option>
                      {variants
                        .filter(v => v.id !== product.id && v.squareParentId === product.squareParentId)
                        .map(v => (
                          <option key={v._id} value={v._id}>
                            {v.name}
                          </option>
                        ))
                      }
                    </select>
                  </div>
                </div>

                {product.proxyOf && (
                  <div className="mt-4">
                    <div className="flex items-center gap-4">
                      <EditableValue
                        label={`Number of ${product.name} that equals one ${variants.find(v => v._id === product.proxyOf)?.name || 'target product'}`}
                        value={product.proxyRatio ?? 1}
                        productId={product.id}
                        field="proxyRatio"
                        type="number"
                        format="number"
                      />
                    </div>
                  </div>
                )}

                <div className="mt-2 text-sm text-gray-600">
                  {product.proxyOf ? (
                    <p>
                      Currently, {product.proxyRatio} {product.name}{product.proxyRatio === 1 ? ' equals' : ' equal'} 1 {variants.find(v => v._id === product.proxyOf)?.name}. 
                      This means their inventory, cost, and weight data are tied together proportionally.
                    </p>
                  ) : (
                    <p>
                      Select another product to establish a proxy relationship. When one product is a proxy of another, 
                      their inventory, cost, and weight data will be tied together based on the ratio you specify.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Variant Information */}
          <div>
            <h2 className="text-lg font-medium mb-4">Variants</h2>
            <div className="space-y-4">
              {allProducts.map((variant) => {
                const variantName = variant.name.split(' - ')[1] || 'Default'
                const profitPerUnit = calculateProfitPerUnit(variant.retailPrice, variant.averageCost)
                const marginPercentage = ((profitPerUnit / variant.retailPrice) * 100).toFixed(1)

                return (
                  <div 
                    key={variant.id}
                    className="p-4 border rounded-lg"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <EditableValue
                          label="Variant Name"
                          value={variantName}
                          productId={variant.id}
                          field="name"
                        />
                        <EditableValue
                          label="SKU"
                          value={variant.sku}
                          productId={variant.id}
                          field="sku"
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <EditableValue
                          label="Current Stock"
                          value={variant.currentStock}
                          productId={variant.id}
                          field="currentStock"
                          type="number"
                        />
                        <EditableValue
                          label="Minimum Stock"
                          value={variant.minimumStock}
                          productId={variant.id}
                          field="minimumStock"
                          type="number"
                          className="mt-2"
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-4">
                      <EditableValue
                        label="Last Purchase Price"
                        value={variant.lastPurchasePrice.toFixed(2)}
                        productId={variant.id}
                        field="lastPurchasePrice"
                        type="number"
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Average Cost</label>
                        <p className="mt-1 text-sm text-gray-900">${variant.averageCost.toFixed(2)}</p>
                      </div>
                      <EditableValue
                        label="Retail Price"
                        value={variant.retailPrice}
                        productId={variant.id}
                        field="retailPrice"
                        type="number"
                        showPreTax={true}
                      />
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Profit per Unit</label>
                        <p className="mt-1 text-sm text-gray-900">${profitPerUnit.toFixed(2)}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Margin</label>
                        <p className="mt-1 text-sm text-gray-900">{marginPercentage}%</p>
                      </div>
                    </div>

                    <div className="mt-4 text-sm text-gray-500">
                      <p>Total Investment: ${(variant.averageCost * variant.currentStock).toFixed(2)}</p>
                      {variant.shopifyId && <p>Shopify Variant ID: {variant.shopifyId}</p>}
                      {variant.squareId && <p>Square Catalog ID: {variant.squareId}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Card>
      {(!product.shopifyId || shopifyProductExists === false) && (
        <Card className="p-6">
          <CreateShopifyProductForm 
            product={baseProduct}
            variants={allProducts.filter(p => p.id !== baseProduct.id)}
            onSuccess={() => {
              console.log('CALLBACK TRIGGERED - START');
              // Find all products with the same Square ID and process their names
              const relatedProducts = allProducts.filter(p => p.squareId === product.squareId);
              console.log('Related products found:', relatedProducts);
              const processedNames = relatedProducts.map(p => {
                const parts = p.name.split(' - ');
                return parts.length > 1 ? parts[1] : parts[0];
              });
              console.log("ALL PRODUCTS FINALLY: " + processedNames);
              fetchProduct();
            }}
          />
        </Card>
      )}
    </div>
  )
} 