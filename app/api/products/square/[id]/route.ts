import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { Db } from 'mongodb'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    
    console.log('[API] Looking up product by Square ID:', params.id);
    
    // Try to find the product by squareId inside platformMetadata 
    const product = await (mongoose.connection.db as Db).collection('products').findOne({
      'platformMetadata': {
        $elemMatch: {
          'platform': 'square',
          'productId': params.id
        }
      }
    })
    
    if (!product) {
      console.log('[API] No product found with Square ID:', params.id);
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Find the Square metadata entry
    const squareMetadata = product.platformMetadata?.find(
      (meta: { platform: string }) => meta.platform === 'square'
    )

    console.log('[API] Found product:', {
      id: product._id,
      name: product.name,
      sku: product.sku,
      squareId: squareMetadata?.productId
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