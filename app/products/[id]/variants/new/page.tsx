'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from "@/components/ui/card"
import { Product } from '@/types'
import { ProductForm } from '@/components/product-form'
import { Button } from "@/components/ui/button"

export default function NewVariant({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [parentProduct, setParentProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchParentProduct()
  }, [params.id])

  const fetchParentProduct = async () => {
    try {
      const response = await fetch(`/api/products/${params.id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch parent product')
      }
      const data = await response.json()
      setParentProduct(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch parent product')
    } finally {
      setLoading(false)
    }
  }

  const handleSuccess = () => {
    router.push(`/products/${params.id}`)
  }

  if (loading) {
    return <div>Loading...</div>
  }

  if (error) {
    return <div className="text-red-600">{error}</div>
  }

  if (!parentProduct) {
    return <div>Parent product not found</div>
  }

  // Create a product with all required fields from the Product interface
  const initialData = {
    id: 'new-variant-temp-id', // Temporary ID that will be replaced
    baseProductName: parentProduct.name.split(' - ')[0], // Extract base product name
    variantName: 'New Variant', // Default variant name
    name: parentProduct.name.split(' - ')[0] + ' - New Variant',
    description: parentProduct.description || '',
    sku: '',
    currentStock: 0,
    minimumStock: parentProduct.minimumStock || 0,
    retailPrice: parentProduct.retailPrice || 0,
    wholesalePrice: parentProduct.wholesalePrice || 0,
    lastPurchasePrice: parentProduct.lastPurchasePrice || 0,
    supplier: parentProduct.supplier || '',
    category: parentProduct.category || '',
    totalSpent: 0,
    totalPurchased: 0,
    averageCost: 0,
    costHistory: [],
    active: true,
    // Keep platform-specific IDs for external sync
    squareParentId: parentProduct.squareParentId,
    shopifyParentId: parentProduct.shopifyId?.split('/').pop()?.split('_')[0],
    platformMetadata: []
  } as unknown as Product; // Use unknown to bypass type checking

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Add Variant</h1>
        <Button
          variant="outline"
          onClick={() => router.push(`/products/${params.id}`)}
        >
          Back to Product
        </Button>
      </div>

      <Card className="p-6">
        <ProductForm 
          initialData={initialData}
          onSuccess={handleSuccess}
        />
      </Card>
    </div>
  )
} 