'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from "@/components/ui/card"
import { Product } from '@/types'
import { ProductForm } from '@/components/product-form'
import { ShopifyProductDetails } from '@/components/shopify-product-details'
import { CreateShopifyProductForm } from '@/components/create-shopify-product-form'

// Helper to check if a product is in Shopify
const isInShopify = (product: Product) => {
  return Boolean(product.shopifyId && product.shopifyId.startsWith('gid://shopify/ProductVariant/'))
}

export default function ProductEdit({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProduct = async () => {
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
  }

  useEffect(() => {
    fetchProduct()
  }, [params.id])

  const handleSuccess = () => {
    router.push('/products')
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

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">Edit Product</h1>
        </div>
        <ProductForm 
          initialData={product}
          onSuccess={handleSuccess}
        />
      </Card>

      {isInShopify(product) ? (
        <ShopifyProductDetails 
          product={product}
          onUpdate={fetchProduct}
        />
      ) : (
        <CreateShopifyProductForm 
          product={product}
          onSuccess={fetchProduct}
        />
      )}
    </div>
  )
} 