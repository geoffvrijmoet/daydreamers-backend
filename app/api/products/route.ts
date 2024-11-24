import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'
    
    const db = await getDb()
    
    console.log('Fetching products from MongoDB...')
    const products = await db.collection('products').find({}).toArray()
    console.log(`Found ${products.length} products`)

    // Map _id to id for frontend consumption
    const mappedProducts = products.map(product => ({
      ...product,
      id: product._id.toString()
    }))

    console.log('First product as example:', mappedProducts[0])

    return NextResponse.json({ products: mappedProducts })
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDb()
    const product = await request.json()

    // Initialize cost tracking fields
    const newProduct = {
      ...product,
      costHistory: [],
      totalSpent: 0,
      totalPurchased: 0,
      averageCost: product.lastPurchasePrice,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const result = await db.collection('products').insertOne(newProduct)
    
    return NextResponse.json({ 
      id: result.insertedId.toString(),
      ...newProduct
    })
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}

// Add update endpoint
export async function PUT(request: Request) {
  try {
    const db = await getDb()
    const { id, ...updates } = await request.json()

    const result = await db.collection('products').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { 
        $set: {
          ...updates,
          updatedAt: new Date().toISOString()
        }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ...result,
      id: result._id.toString()
    })
  } catch (error) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
} 