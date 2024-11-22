import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'
import { getDb } from '@/lib/db'
import { ObjectId } from 'mongodb'

export async function POST() {
  try {
    const db = await getDb()
    console.log('Fetching products from Square...')

    // Get all products from Square
    const { result } = await squareClient.catalogApi.listCatalog(undefined, 'ITEM')
    const squareProducts = result.objects || []

    console.log(`Found ${squareProducts.length} products in Square`)

    const updates = await Promise.all(squareProducts.map(async (squareProduct) => {
      if (squareProduct.type !== 'ITEM') return null
      const item = squareProduct.itemData!

      // Get the first variation's price (assuming it exists)
      const variation = item.variations?.[0]
      const price = variation?.itemVariationData?.priceMoney?.amount || 0

      // Try to find existing product by Square ID
      const existingProduct = await db.collection('products').findOne({
        squareId: squareProduct.id
      })

      const productData = {
        name: item.name,
        description: item.description || '',
        sku: variation?.itemVariationData?.sku || '',
        retailPrice: price / 100, // Convert cents to dollars
        currentStock: 0, // Will be updated from inventory
        minimumStock: 5, // Default value
        lastPurchasePrice: existingProduct?.lastPurchasePrice || 0,
        averageCost: existingProduct?.averageCost || 0,
        supplier: existingProduct?.supplier || '',
        category: item.category?.name || '',
        squareId: squareProduct.id,
        active: true,
        costHistory: existingProduct?.costHistory || [],
        totalSpent: existingProduct?.totalSpent || 0,
        totalPurchased: existingProduct?.totalPurchased || 0,
        updatedAt: new Date().toISOString()
      }

      if (existingProduct) {
        // Update existing product
        await db.collection('products').updateOne(
          { _id: existingProduct._id },
          { 
            $set: {
              ...productData,
              // Preserve certain fields
              lastPurchasePrice: existingProduct.lastPurchasePrice,
              averageCost: existingProduct.averageCost,
              costHistory: existingProduct.costHistory,
              totalSpent: existingProduct.totalSpent,
              totalPurchased: existingProduct.totalPurchased
            }
          }
        )
        return { action: 'updated', id: existingProduct._id, name: item.name }
      } else {
        // Create new product
        const result = await db.collection('products').insertOne({
          ...productData,
          createdAt: new Date().toISOString()
        })
        return { action: 'created', id: result.insertedId, name: item.name }
      }
    }))

    // Get inventory counts
    const { result: inventoryResult } = await squareClient.inventoryApi.retrieveInventoryCounts({
      locationIds: [process.env.SQUARE_LOCATION_ID!]
    })

    // Update inventory counts
    if (inventoryResult.counts) {
      await Promise.all(inventoryResult.counts.map(async (count) => {
        if (!count.catalogObjectId) return

        await db.collection('products').updateOne(
          { squareId: count.catalogObjectId },
          { 
            $set: { 
              currentStock: Number(count.quantity || 0),
              updatedAt: new Date().toISOString()
            }
          }
        )
      }))
    }

    const results = updates.filter(Boolean)
    const created = results.filter(r => r?.action === 'created').length
    const updated = results.filter(r => r?.action === 'updated').length

    return NextResponse.json({
      message: `Sync complete. Created: ${created}, Updated: ${updated} products`,
      details: results
    })
  } catch (error) {
    console.error('Error syncing Square products:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync products' },
      { status: 500 }
    )
  }
} 