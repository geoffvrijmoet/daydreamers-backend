import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query) {
      return NextResponse.json({ products: [] })
    }

    const db = await getDb()
    
    // Create a case-insensitive regex for the search
    const searchRegex = new RegExp(query, 'i')

    // Search for products that:
    // 1. Don't have a Shopify ID yet (unmatched)
    // 2. Match the search query in name or SKU
    // 3. Are active
    const products = await db.collection('products')
      .find({
        shopifyId: { $exists: false },
        active: { $ne: false },
        $or: [
          { name: searchRegex },
          { sku: searchRegex }
        ]
      })
      .project({
        _id: 1,
        name: 1,
        sku: 1,
        retailPrice: 1
      })
      .limit(10) // Limit to 10 results for performance
      .toArray()

    return NextResponse.json({ products })

  } catch (error) {
    console.error('Error searching products:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to search products' },
      { status: 500 }
    )
  }
} 