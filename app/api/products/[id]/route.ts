import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { ObjectId, Db } from 'mongodb'
import { type Product } from '@/types'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    const product = await (mongoose.connection.db as Db).collection<Product>('products').findOne({ 
      _id: new ObjectId(params.id) as unknown as string
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Convert _id to id for frontend
    const productWithId = {
      ...product,
      id: product._id.toString(),
    }

    return NextResponse.json(productWithId)
  } catch (error) {
    console.error('Error fetching product:', error)
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    const updates = await request.json()
    
    // Get the current product
    const currentProduct = await (mongoose.connection.db as Db).collection('products').findOne({
      _id: new ObjectId(params.id)
    })

    if (!currentProduct) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Handle proxy-related updates
    if ('proxyOf' in updates || 'proxyRatio' in updates) {
      // If removing proxy relationship
      if (updates.proxyOf === null) {
        await (mongoose.connection.db as Db).collection('products').updateOne(
          { _id: new ObjectId(currentProduct.proxyOf) },
          { $set: { isProxied: false } }
        )
      }
      // If setting new proxy relationship
      else if (updates.proxyOf) {
        // Verify target product exists
        const targetProduct = await (mongoose.connection.db as Db).collection('products').findOne({
          _id: new ObjectId(updates.proxyOf)
        })
        if (!targetProduct) {
          return NextResponse.json(
            { error: 'Proxy target product not found' },
            { status: 404 }
          )
        }
        // Mark target product as being proxied
        await (mongoose.connection.db as Db).collection('products').updateOne(
          { _id: new ObjectId(updates.proxyOf) },
          { $set: { isProxied: true } }
        )
      }
    }

    // Handle inventory-related updates
    if ('currentStock' in updates && currentProduct.proxyOf) {
      const proxyTarget = await (mongoose.connection.db as Db).collection('products').findOne({
        _id: new ObjectId(currentProduct.proxyOf)
      })
      if (proxyTarget) {
        // Calculate the change in stock
        const stockDiff = updates.currentStock - currentProduct.currentStock
        // Update the proxy target's stock proportionally
        await (mongoose.connection.db as Db).collection('products').updateOne(
          { _id: new ObjectId(currentProduct.proxyOf) },
          { 
            $inc: { 
              currentStock: stockDiff / (currentProduct.proxyRatio || 1)
            }
          }
        )
      }
    }

    // Handle cost-related updates
    if ('lastPurchasePrice' in updates && currentProduct.proxyOf) {
      const proxyTarget = await (mongoose.connection.db as Db).collection('products').findOne({
        _id: new ObjectId(currentProduct.proxyOf)
      })
      if (proxyTarget) {
        // Update the proxy target's cost proportionally
        await (mongoose.connection.db as Db).collection('products').updateOne(
          { _id: new ObjectId(currentProduct.proxyOf) },
          { 
            $set: { 
              lastPurchasePrice: updates.lastPurchasePrice * (currentProduct.proxyRatio || 1)
            }
          }
        )
      }
    }

    // Update the product
    const result = await (mongoose.connection.db as Db).collection('products').updateOne(
      { _id: new ObjectId(params.id) },
      { 
        $set: { 
          ...updates,
          updatedAt: new Date().toISOString()
        } 
      }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: 'Product updated successfully'
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
    await connectToDatabase()

    // First, get the product to check if it has Square/Shopify IDs
    const product = await (mongoose.connection.db as Db).collection('products').findOne({
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
    const result = await (mongoose.connection.db as Db).collection('products').deleteOne({
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