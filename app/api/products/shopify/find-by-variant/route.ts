import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const variantId = searchParams.get('variantId')
    console.log('[API] Received request for variant ID:', variantId)

    if (!variantId) {
      console.log('[API] Error: No variantId provided')
      return NextResponse.json({ error: 'variantId is required' }, { status: 400 })
    }

    // Convert numeric variant ID to Shopify's GraphQL format
    const shopifyVariantId = `gid://shopify/ProductVariant/${variantId}`
    console.log('[API] Converted to Shopify variant ID:', shopifyVariantId)

    const db = await getDb()
    console.log('[API] Connected to database')
    
    // Find product with matching Shopify variant ID
    console.log('[API] Searching for product with shopifyVariantId:', shopifyVariantId)
    const product = await db.collection('products')
      .findOne({ 
        shopifyVariantId,
        active: { $ne: false }
      }, {
        projection: {
          _id: 1,
          name: 1,
          sku: 1,
          retailPrice: 1,
          currentStock: 1,
          lastPurchasePrice: 1,
          shopifyVariantId: 1, // Added to verify the match
          averageCost: 1
        }
      })

    console.log('[API] Database query result:', product)

    if (!product) {
      console.log('[API] No product found for variant ID')
      return NextResponse.json({ product: null })
    }

    console.log('[API] Successfully found product:', {
      id: product._id,
      name: product.name,
      sku: product.sku,
      averageCost: product.averageCost
    })

    return NextResponse.json({
      product: {
        _id: product._id,
        name: product.name,
        sku: product.sku,
        retailPrice: product.retailPrice,
        currentStock: product.currentStock,
        lastPurchasePrice: product.lastPurchasePrice,
        averageCost: product.averageCost
      }
    })

  } catch (error) {
    console.error('[API] Error finding product by variant ID:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to find product' },
      { status: 500 }
    )
  }
} 