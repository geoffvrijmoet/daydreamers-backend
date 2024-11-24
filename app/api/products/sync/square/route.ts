import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'
import { getDb } from '@/lib/db'

export async function POST() {
  try {
    const db = await getDb()
    console.log('\n=== Starting Square Catalog Sync ===')

    // Get all catalog items from Square
    const { result } = await squareClient.catalogApi.listCatalog(undefined, 'ITEM')
    const squareProducts = result.objects || []

    // Track all variations for logging
    const allVariations: { name: string, variations: number }[] = []
    
    console.log('\nProcessing products and their variations...')
    const updates = await Promise.all(squareProducts.flatMap(async (squareProduct) => {
      if (squareProduct.type !== 'ITEM' || !squareProduct.itemData) {
        return []
      }

      const item = squareProduct.itemData
      const isIceCream = item.name?.toLowerCase().includes('ice cream')
      
      // Log product variations count
      allVariations.push({
        name: item.name || '',
        variations: item.variations?.length || 0
      })

      if (isIceCream) {
        console.log(`\nProcessing ice cream product: ${item.name}`)
        console.log('Square product details:', {
          id: squareProduct.id,
          name: item.name,
          variations: item.variations?.length || 0,
          categoryId: item.categoryId
        })
      }

      // Process each variation as a separate product
      return (item.variations || []).map(async (variation) => {
        if (!variation.itemVariationData) return null

        const variationData = variation.itemVariationData
        const priceAmount = variationData.priceMoney?.amount
        const price = priceAmount ? Number(priceAmount.toString()) : 0

        // Generate a unique name for the variation
        const variationName = variationData.name 
          ? `${item.name} - ${variationData.name}`
          : item.name || ''

        if (isIceCream) {
          console.log('Processing variation:', {
            id: variation.id,
            name: variationName,
            sku: variationData.sku,
            price: price / 100
          })
        }

        // Generate a SKU if none exists
        const sku = variationData.sku || `SQUARE-${variation.id}`

        // Look for existing product by variation ID
        const existingProduct = await db.collection('products').findOne({
          squareId: variation.id  // Use variation ID instead of parent product ID
        })

        if (isIceCream) {
          console.log('Database lookup result:', existingProduct ? 'Found' : 'Not found')
        }

        const productData = {
          name: variationName,
          description: item.description || '',
          sku: sku,
          retailPrice: Number(price) / 100,
          currentStock: 0, // Will be updated from inventory
          minimumStock: existingProduct?.minimumStock || 5,
          lastPurchasePrice: existingProduct?.lastPurchasePrice || 0,
          averageCost: existingProduct?.averageCost || 0,
          supplier: existingProduct?.supplier || '',
          category: item.categoryId || '',
          squareId: variation.id,  // Store variation ID
          squareParentId: squareProduct.id,  // Store parent product ID
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
                lastPurchasePrice: existingProduct.lastPurchasePrice,
                averageCost: existingProduct.averageCost,
                costHistory: existingProduct.costHistory,
                totalSpent: existingProduct.totalSpent,
                totalPurchased: existingProduct.totalPurchased
              }
            }
          )
          return { action: 'updated', id: existingProduct._id, name: variationName }
        } else {
          // Create new product
          const result = await db.collection('products').insertOne({
            ...productData,
            createdAt: new Date().toISOString()
          })
          return { action: 'created', id: result.insertedId, name: variationName }
        }
      })
    }))

    // Flatten and filter out nulls
    const results = (await Promise.all(updates.flat())).filter(Boolean)
    const created = results.filter(r => r?.action === 'created').length
    const updated = results.filter(r => r?.action === 'updated').length

    // Get inventory counts for variations
    console.log('\nFetching inventory counts...')
    const { result: inventoryResult } = await squareClient.inventoryApi.batchRetrieveInventoryCounts({
      catalogObjectIds: squareProducts
        .filter(p => p.type === 'ITEM')
        .flatMap(p => p.itemData?.variations?.map(v => v.id) || [])
    })

    // Update inventory counts
    if (inventoryResult.counts) {
      console.log(`Updating inventory for ${inventoryResult.counts.length} variations`)
      await Promise.all(inventoryResult.counts.map(async (count) => {
        if (!count.catalogObjectId || !count.quantity) return

        await db.collection('products').updateOne(
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

    console.log('\n=== Sync Summary ===')
    console.log('Products with variations:')
    allVariations.forEach(p => {
      console.log(`- ${p.name}: ${p.variations} variation(s)`)
    })
    console.log(`Created: ${created}, Updated: ${updated} variations`)

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