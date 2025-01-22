import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query')

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      )
    }

    const db = await getDb()
    
    // Create a case-insensitive regex for the search
    const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    console.log('\nProduct search:', {
      query,
      regex: searchRegex.toString()
    })

    // First get all products to log them
    const allProducts = await db.collection('products').find({}).toArray()
    console.log('All products in database:', allProducts.map(p => ({
      name: p.name,
      id: p._id.toString()
    })))

    // Then do the search
    const products = await db.collection('products')
      .find({
        name: searchRegex
      })
      .limit(5) // Limit to top 5 matches
      .toArray()

    console.log('Search results:', {
      query,
      regex: searchRegex.toString(),
      count: products.length,
      matches: products.map(p => ({
        name: p.name,
        id: p._id.toString()
      }))
    })

    // Map _id to id for frontend consumption
    const mappedProducts = products.map(product => ({
      ...product,
      id: product._id.toString()
    }))

    return NextResponse.json({ products: mappedProducts })
  } catch (error) {
    console.error('Error searching products:', error)
    return NextResponse.json(
      { error: 'Failed to search products' },
      { status: 500 }
    )
  }
} 