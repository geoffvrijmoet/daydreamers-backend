import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    
    console.log('[API] Looking up product by Square ID:', params.id);
    
    // Try to find the product by squareId inside platformMetadata 
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
    const product = await db.collection('products').findOne({
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