import { NextResponse } from 'next/server'
import { shopifyAdmin } from '@/lib/shopify-admin'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const decodedId = decodeURIComponent(id)

    // Extract the numeric ID from any format
    const numericId = decodedId.replace(/^gid:\/\/shopify\/(Product|ProductVariant)\//, '')
                              .replace(/[^\d]/g, '')

    if (!numericId) {
      return NextResponse.json({ 
        exists: false, 
        details: { error: 'Invalid ID format' } 
      }, { status: 400 })
    }

    interface ShopifyResponse {
      product?: {
        id: string
        status: string
      } | null
      productVariant?: {
        id: string
        product: {
          id: string
          status: string
        }
      } | null
    }

    const productId = `gid://shopify/Product/${numericId}`
    const variantId = `gid://shopify/ProductVariant/${numericId}`

    console.log('Checking with IDs:', { productId, variantId })

    const response = await shopifyAdmin.request<ShopifyResponse>(`
      query checkBoth($productId: ID!, $variantId: ID!) {
        product(id: $productId) {
          id
          status
        }
        productVariant(id: $variantId) {
          id
          product {
            id
            status
          }
        }
      }
    `, {
      productId,
      variantId
    })

    console.log('Shopify response:', JSON.stringify(response, null, 2))

    // Check if either the product or variant exists and is not deleted
    const productExists = response?.product?.status !== 'DELETED'
    const variantExists = response?.productVariant?.product?.status !== 'DELETED'
    const exists = productExists || variantExists

    console.log('Product exists:', productExists, 'Variant exists:', variantExists)

    return NextResponse.json({ 
      exists,
      details: {
        productExists,
        variantExists,
        productStatus: response?.product?.status,
        variantProductStatus: response?.productVariant?.product?.status
      }
    })
  } catch (error) {
    console.error('Error checking Shopify product:', error)
    return NextResponse.json({ exists: false, details: { error: 'Failed to check product existence' } })
  }
} 