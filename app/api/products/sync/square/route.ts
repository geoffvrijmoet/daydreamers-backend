import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { Db } from 'mongodb'

type ReviewedProduct = {
  id: string
  name: string
  description?: string
  sku: string
  price: number
  minimumStock: number
  supplier: string
  category: string
}

export async function POST(request: Request) {
  try {
    await connectToDatabase()
    console.log('Starting Square catalog sync...')

    // Get reviewed products from request
    const { products } = await request.json() as { products: ReviewedProduct[] }
    
    // Get Square catalog items to get parent IDs
    const { result } = await squareClient.catalogApi.listCatalog(undefined, 'ITEM')
    const squareProducts = result.objects || []

    // Create a map of variation IDs to parent product IDs
    const parentIdMap = new Map<string, string>()
    squareProducts.forEach(item => {
      if (item.type === 'ITEM' && item.itemData) {
        item.itemData.variations?.forEach(variation => {
          if (variation.id) {
            parentIdMap.set(variation.id, item.id)
          }
        })
      }
    })

    // Process each reviewed product
    const updates = await Promise.all(products.map(async (reviewedProduct) => {
      // Look for existing product by Square ID
      const existingProduct = await (mongoose.connection.db as Db).collection('products').findOne({
        squareId: reviewedProduct.id
      })

      const productData = {
        name: reviewedProduct.name,
        description: reviewedProduct.description || '',
        sku: reviewedProduct.sku,
        retailPrice: reviewedProduct.price,
        currentStock: 0, // Will be updated from inventory
        minimumStock: reviewedProduct.minimumStock,
        lastPurchasePrice: existingProduct?.lastPurchasePrice || 0,
        averageCost: existingProduct?.averageCost || 0,
        supplier: reviewedProduct.supplier,
        category: reviewedProduct.category,
        squareId: reviewedProduct.id,
        squareParentId: parentIdMap.get(reviewedProduct.id),
        active: true,
        costHistory: existingProduct?.costHistory || [],
        totalSpent: existingProduct?.totalSpent || 0,
        totalPurchased: existingProduct?.totalPurchased || 0,
        updatedAt: new Date().toISOString()
      }

      if (existingProduct) {
        // Update existing product
        await (mongoose.connection.db as Db).collection('products').updateOne(
          { _id: existingProduct._id },
          { 
            $set: {
              ...productData,
              lastPurchasePrice: existingProduct.lastPurchasePrice,
              averageCost: existingProduct.averageCost,
              costHistory: existingProduct.costHistory,
              totalSpent: existingProduct.totalSpent,
              totalPurchased: existingProduct.totalPurchased
            }
          }
        )
        return { action: 'updated', id: existingProduct._id, name: reviewedProduct.name }
      } else {
        // Create new product
        const result = await (mongoose.connection.db as Db).collection('products').insertOne({
          ...productData,
          createdAt: new Date().toISOString()
        })
        return { action: 'created', id: result.insertedId, name: reviewedProduct.name }
      }
    }))

    // Get inventory counts for variations
    console.log('\nFetching inventory counts...')
    const { result: inventoryResult } = await squareClient.inventoryApi.batchRetrieveInventoryCounts({
      catalogObjectIds: products.map(p => p.id)
    })

    // Update inventory counts
    if (inventoryResult.counts) {
      console.log(`Updating inventory for ${inventoryResult.counts.length} variations`)
      await Promise.all(inventoryResult.counts.map(async (count) => {
        if (!count.catalogObjectId || !count.quantity) return

        await (mongoose.connection.db as Db).collection('products').updateOne(
          { squareId: count.catalogObjectId },
          { 
            $set: { 
              currentStock: Number(count.quantity),
              updatedAt: new Date().toISOString()
            }
          }
        )
      }))
    }

    const created = updates.filter(r => r.action === 'created').length
    const updated = updates.filter(r => r.action === 'updated').length

    return NextResponse.json({
      message: `Sync complete. Created: ${created}, Updated: ${updated} products`,
      details: updates
    })

  } catch (error) {
    console.error('Error syncing Square products:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync products' },
      { status: 500 }
    )
  }
} 