import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { ObjectId } from 'mongodb'
import { squareClient } from '@/lib/square'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getDb()

    // First, get the product to check if it has Square/Shopify IDs
    const product = await db.collection('products').findOne({
      _id: new ObjectId(params.id)
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // If product exists in Square, don't allow deletion
    if (product.squareId) {
      return NextResponse.json(
        { 
          error: 'Cannot delete product that exists in Square. Please delete it in Square first.',
          squareId: product.squareId 
        },
        { status: 400 }
      )
    }

    // If product exists in Shopify, don't allow deletion
    if (product.shopifyId) {
      return NextResponse.json(
        { 
          error: 'Cannot delete product that exists in Shopify. Please delete it in Shopify first.',
          shopifyId: product.shopifyId 
        },
        { status: 400 }
      )
    }

    // If product is local-only, proceed with deletion
    const result = await db.collection('products').deleteOne({
      _id: new ObjectId(params.id)
    })

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: 'Product deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    )
  }
} 