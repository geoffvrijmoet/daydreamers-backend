import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'
import { connectToDatabase } from '@/lib/mongoose'
import ProductModel from '@/lib/models/Product'



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

interface PlatformMetadata {
  platform: 'shopify' | 'square';
  productId: string;
  parentId?: string;
  lastSyncedAt: Date;
  syncStatus: 'success' | 'failed' | 'pending';
  lastError?: string;
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
      // Look for existing product by Square ID in platformMetadata
      const existingProduct = await ProductModel.findOne({
        'platformMetadata': {
          $elemMatch: {
            'platform': 'square',
            'productId': reviewedProduct.id
          }
        }
      })

      // Create platform metadata for Square
      const squareMetadata: PlatformMetadata = {
        platform: 'square',
        productId: reviewedProduct.id,
        parentId: parentIdMap.get(reviewedProduct.id),
        lastSyncedAt: new Date(),
        syncStatus: 'success'
      }

      // Split the name into baseProductName and variantName
      // For simplicity, we'll use the whole name as baseProductName if there's no variant indicated
      const nameParts = reviewedProduct.name.split(' - ')
      const baseProductName = nameParts[0]
      const variantName = nameParts.length > 1 ? nameParts.slice(1).join(' - ') : 'Default'

      const productData = {
        baseProductName,
        variantName,
        name: reviewedProduct.name,
        description: reviewedProduct.description || '',
        sku: reviewedProduct.sku,
        price: reviewedProduct.price,
        stock: 0, // Will be updated from inventory
        minimumStock: reviewedProduct.minimumStock,
        lastPurchasePrice: existingProduct?.lastPurchasePrice || 0,
        averageCost: existingProduct?.averageCost || 0,
        supplier: reviewedProduct.supplier,
        category: reviewedProduct.category,
        active: true,
        costHistory: existingProduct?.costHistory || [],
        totalSpent: existingProduct?.totalSpent || 0,
        totalPurchased: existingProduct?.totalPurchased || 0,
        updatedAt: new Date().toISOString()
      }

      if (existingProduct) {
        // For existing products, update fields but keep platformMetadata array
        // If there's existing Square metadata, update it; otherwise add new
        const platformMetadata = existingProduct.platformMetadata || []
        const squareMetadataIndex = platformMetadata.findIndex(
          (meta: PlatformMetadata) => meta.platform === 'square'
        )
        
        if (squareMetadataIndex >= 0) {
          // Update existing Square metadata
          platformMetadata[squareMetadataIndex] = {
            ...platformMetadata[squareMetadataIndex],
            ...squareMetadata
          }
        } else {
          // Add new Square metadata
          platformMetadata.push(squareMetadata)
        }

        // Update existing product
        await ProductModel.updateOne(
          { _id: existingProduct._id },
          { 
            $set: {
              ...productData,
              platformMetadata,
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
        // Create new product with platformMetadata
        const result = await ProductModel.insertOne({
          ...productData,
          platformMetadata: [squareMetadata],
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

        // Update stock for products where the Square ID matches in platformMetadata
        await ProductModel.updateOne(
          {
            'platformMetadata': {
              $elemMatch: {
                'platform': 'square',
                'productId': count.catalogObjectId
              }
            }
          },
          { 
            $set: { 
              stock: Number(count.quantity),
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