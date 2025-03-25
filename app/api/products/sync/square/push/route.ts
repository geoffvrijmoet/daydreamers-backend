import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { ObjectId, Db } from 'mongodb'

export async function POST(request: Request) {
  try {
    await connectToDatabase()
    const { productId } = await request.json()

    // Get product from our database
    const product = await (mongoose.connection.db as Db).collection('products').findOne({ _id: new ObjectId(productId) })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // If product has no Square ID, create new catalog item
    if (!product.squareId) {
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
                    amount: BigInt(Math.round(product.retailPrice * 100)),
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

      // Save Square ID back to our database
      await (mongoose.connection.db as Db).collection('products').updateOne(
        { _id: new ObjectId(productId) },
        { 
          $set: { 
            squareId: result.catalogObject!.id,
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
        id: product.squareId,
        itemData: {
          name: product.name,
          description: product.description,
          variations: [
            {
              type: 'ITEM_VARIATION',
              id: `${product.squareId}_variation`,
              itemVariationData: {
                priceMoney: {
                  amount: BigInt(Math.round(product.retailPrice * 100)),
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

    // Update inventory if needed
    await squareClient.inventoryApi.batchChangeInventory({
      idempotencyKey: `inventory_${productId}_${Date.now()}`,
      changes: [
        {
          type: 'PHYSICAL_COUNT',
          physicalCount: {
            catalogObjectId: result.catalogObject!.itemData!.variations![0].id,
            quantity: product.currentStock.toString(),
            locationId: process.env.SQUARE_LOCATION_ID!
          }
        }
      ]
    })

    return NextResponse.json({
      message: 'Product updated in Square',
      squareId: result.catalogObject!.id
    })
  } catch (error) {
    console.error('Error pushing to Square:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync with Square' },
      { status: 500 }
    )
  }
} 