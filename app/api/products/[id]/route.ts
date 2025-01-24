import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { ObjectId } from 'mongodb'
import { type Product, type CostHistoryEntry } from '@/types'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getDb()
    const updates = await request.json()

    // If updating lastPurchasePrice, add a cost history entry
    if ('lastPurchasePrice' in updates) {
      const costEntry: CostHistoryEntry = {
        date: new Date().toISOString(),
        quantity: 0, // No quantity change for manual price update
        unitPrice: updates.lastPurchasePrice,
        totalPrice: 0,
        source: 'manual',
        notes: 'Manual price update'
      }

      const result = await db.collection<Product>('products').findOneAndUpdate(
        { _id: new ObjectId(params.id) },
        {
          $set: {
            ...updates,
            updatedAt: new Date().toISOString()
          },
          $push: {
            costHistory: costEntry
          }
        },
        { returnDocument: 'after' }
      )

      if (!result) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        product: {
          ...result,
          id: result._id.toString()
        }
      })
    }

    // For other fields, just update them
    const result = await db.collection<Product>('products').findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      {
        $set: {
          ...updates,
          updatedAt: new Date().toISOString()
        }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      product: {
        ...result,
        id: result._id.toString()
      }
    })
  } catch (error) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
}

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

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getDb()
    const product = await db.collection<Product>('products').findOne({ 
      _id: new ObjectId(params.id)
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error fetching product:', error)
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    )
  }
} 