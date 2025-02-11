import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getDb()
    
    console.log('[API] Looking up product by Square ID:', params.id);
    
    // Try to find the product by squareId
    const product = await db.collection('products').findOne({ squareId: params.id })
    
    if (!product) {
      console.log('[API] No product found with Square ID:', params.id);
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    console.log('[API] Found product:', {
      id: product._id,
      name: product.name,
      sku: product.sku,
      squareId: product.squareId
    });

    return NextResponse.json({ product })
  } catch (error) {
    console.error('[API] Error fetching product:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch product' },
      { status: 500 }
    )
  }
} 