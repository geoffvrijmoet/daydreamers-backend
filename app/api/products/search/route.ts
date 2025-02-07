import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query')

    if (!query) {
      return NextResponse.json({ products: [] })
    }

    const db = await getDb()
    
    // Create a case-insensitive regex for the search
    const searchRegex = new RegExp(query, 'i')

    // Search for products that:
    // 1. Match the search query in name or SKU
    // 2. Are active
    const products = await db.collection('products')
      .find({
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
        retailPrice: 1,
        lastPurchasePrice: 1
      })
      .toArray()

    // Sort products to prioritize:
    // 1. Exact matches
    // 2. Regular versions
    // 3. Everything else
    const sortedProducts = products.sort((a, b) => {
      // First priority: exact matches
      const aExactMatch = a.name.toLowerCase() === query.toLowerCase()
      const bExactMatch = b.name.toLowerCase() === query.toLowerCase()
      if (aExactMatch && !bExactMatch) return -1
      if (!aExactMatch && bExactMatch) return 1

      // Second priority: Regular vs Bulk
      const aIsRegular = a.name.includes('Regular')
      const bIsRegular = b.name.includes('Regular')
      const aIsBulk = a.name.includes('Bulk')
      const bIsBulk = b.name.includes('Bulk')
      
      if (aIsRegular && !bIsRegular) return -1
      if (!aIsRegular && bIsRegular) return 1
      if (aIsBulk && !bIsBulk) return 1
      if (!aIsBulk && bIsBulk) return -1

      // Default to alphabetical order
      return a.name.localeCompare(b.name)
    })

    // Limit to 10 results after sorting
    const limitedProducts = sortedProducts.slice(0, 10)

    return NextResponse.json({ products: limitedProducts })

  } catch (error) {
    console.error('Error searching products:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to search products' },
      { status: 500 }
    )
  }
} 