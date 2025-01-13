import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'
import { getDb } from '@/lib/db'

type SquareProduct = {
  id: string
  name: string
  description: string
  sku: string
  price: number
  parentId: string
}

export async function GET() {
  try {
    const db = await getDb()
    console.log('Fetching Square catalog for preview...')

    // First, get existing product IDs from MongoDB
    const existingProducts = await db.collection('products')
      .find({ squareId: { $exists: true } })
      .project({ squareId: 1 })
      .toArray()
    
    const existingSquareIds = new Set(existingProducts.map(p => p.squareId))
    console.log(`Found ${existingSquareIds.size} existing products in MongoDB`)

    // Get all catalog items from Square with pagination
    const allProducts = []
    let cursor = undefined
    
    do {
      const { result } = await squareClient.catalogApi.listCatalog(cursor, 'ITEM')
      const products = result.objects || []
      allProducts.push(...products)
      cursor = result.cursor
      
      console.log(`Fetched batch of ${products.length} products${cursor ? ', more available' : ''}`)
    } while (cursor)
    
    console.log(`Total products fetched from Square: ${allProducts.length}`)
    
    const squareProducts = allProducts

    // Log products that are not of type ITEM
    const nonItemProducts = squareProducts.filter(item => item.type !== 'ITEM')
    console.log('Products that are not of type ITEM:', nonItemProducts.map(item => ({
      id: item.id,
      type: item.type
    })))

    // Log products with "duck training" in their name
    const duckTrainingProducts = squareProducts.filter(item => 
      item.type === 'ITEM' && 
      item.itemData?.name?.toLowerCase().includes('duck training')
    )
    console.log('Products with "duck training" in name:', duckTrainingProducts.map(item => ({
      id: item.id,
      name: item.itemData?.name,
      variations: item.itemData?.variations?.map(v => ({
        id: v.id,
        name: v.itemVariationData?.name
      }))
    })))

    // Transform Square catalog items into a simpler format, ONLY including new products
    const products: SquareProduct[] = squareProducts.flatMap(item => {
      if (item.type !== 'ITEM' || !item.itemData) return []

      return (item.itemData.variations || [])
        // First filter out any variations that already exist in MongoDB
        .filter(variation => !existingSquareIds.has(variation.id))
        .map(variation => {
          if (!variation.itemVariationData) return null

          const variationData = variation.itemVariationData
          const priceAmount = variationData.priceMoney?.amount
          const price = priceAmount ? Number(priceAmount) / 100 : 0

          // Generate a unique name for the variation
          const variationName = variationData.name 
            ? `${item.itemData?.name} - ${variationData.name}`
            : item.itemData?.name || ''

          return {
            id: variation.id,
            name: variationName,
            description: item.itemData?.description || '',
            sku: variationData.sku || `SQUARE-${variation.id}`,
            price,
            parentId: item.id
          }
        }).filter((p): p is SquareProduct => p !== null)
    })

    console.log(`Found ${products.length} NEW products that don't exist in MongoDB yet`)
    return NextResponse.json({ products })

  } catch (error) {
    console.error('Error fetching Square products:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Square products' },
      { status: 500 }
    )
  }
} 