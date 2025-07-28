import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'

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
    const { productId } = await request.json()

    // Get product from our database
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
    const product = await db.collection('products').findOne({ _id: new ObjectId(productId) })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Check if product has Square metadata
    const squareMetadata = product.platformMetadata?.find(
      (meta: { platform: string }) => meta.platform === 'square'
    )

    // If product has no Square ID, create new catalog item
    if (!squareMetadata?.productId) {
      const { result } = await squareClient.catalogApi.upsertCatalogObject({
        idempotencyKey: `create_${productId}_${Date.now()}`,
        object: {
          type: 'ITEM',
          id: '#' + productId, // Temporary ID
          itemData: {
            name: product.name,
            description: product.description,
            variations: [
              {
                type: 'ITEM_VARIATION',
                id: '#variation_' + productId,
                itemVariationData: {
                  priceMoney: {
                    amount: BigInt(Math.round(product.price * 100)),
                    currency: 'USD'
                  },
                  pricingType: 'FIXED_PRICING',
                  sku: product.sku
                }
              }
            ]
          }
        }
      })

      // Create Square platform metadata
      const newSquareMetadata: PlatformMetadata = {
        platform: 'square',
        productId: result.catalogObject!.id,
        lastSyncedAt: new Date(),
        syncStatus: 'success'
      }

      // Add Square metadata to platformMetadata array
      const platformMetadata = product.platformMetadata || []
      platformMetadata.push(newSquareMetadata)

      // Save Square ID back to our database
      const db = mongoose.connection.db;
      if (!db) {
        return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
      }
      await db.collection('products').updateOne(
        { _id: new ObjectId(productId) },
        { 
          $set: { 
            platformMetadata,
            updatedAt: new Date().toISOString()
          }
        }
      )

      return NextResponse.json({
        message: 'Product created in Square',
        squareId: result.catalogObject!.id
      })
    }

    // Update existing Square catalog item
    const { result } = await squareClient.catalogApi.upsertCatalogObject({
      idempotencyKey: `update_${productId}_${Date.now()}`,
      object: {
        type: 'ITEM',
        id: squareMetadata.productId,
        itemData: {
          name: product.name,
          description: product.description,
          variations: [
            {
              type: 'ITEM_VARIATION',
              id: `${squareMetadata.productId}_variation`,
              itemVariationData: {
                priceMoney: {
                  amount: BigInt(Math.round(product.price * 100)),
                  currency: 'USD'
                },
                pricingType: 'FIXED_PRICING',
                sku: product.sku
              }
            }
          ]
        }
      }
    })

    // Update platform metadata with latest sync info
    const platformMetadata = product.platformMetadata || []
    const squareMetadataIndex = platformMetadata.findIndex(
      (meta: { platform: string }) => meta.platform === 'square'
    )
    
    if (squareMetadataIndex >= 0) {
      platformMetadata[squareMetadataIndex] = {
        ...platformMetadata[squareMetadataIndex],
        lastSyncedAt: new Date(),
        syncStatus: 'success'
      }
    }

    // Update product with latest sync info
    await db.collection('products').updateOne(
      { _id: new ObjectId(productId) },
      { 
        $set: { 
          platformMetadata,
          updatedAt: new Date().toISOString()
        }
      }
    )

    // Update inventory if needed
    await squareClient.inventoryApi.batchChangeInventory({
      idempotencyKey: `inventory_${productId}_${Date.now()}`,
      changes: [
        {
          type: 'PHYSICAL_COUNT',
          physicalCount: {
            catalogObjectId: result.catalogObject!.itemData!.variations![0].id,
            quantity: product.stock.toString(),
            locationId: process.env.SQUARE_LOCATION_ID!
          }
        }
      ]
    })

    return NextResponse.json({
      message: 'Product updated in Square',
      squareId: squareMetadata.productId
    })
  } catch (error) {
    console.error('Error pushing to Square:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync with Square' },
      { status: 500 }
    )
  }
} 