import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { type Product } from '@/types'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { db } = await connectToDatabase()
    
    // First get the product to find its baseProductName
    const product = await db.collection<Product>('products').findOne({ 
      _id: new ObjectId(params.id) as unknown as string
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Find all products with the same baseProductName
    const variants = await db.collection<Product>('products')
      .find({ 
        baseProductName: product.baseProductName,
        _id: { $ne: params.id } // Exclude the current product using string ID
      })
      .toArray()

    // Map _id to id for frontend
    const mappedVariants = variants.map(variant => ({
      ...variant,
      id: variant._id?.toString() || ''
    }))

    return NextResponse.json({ variants: mappedVariants })
  } catch (error) {
    console.error('Error fetching variants:', error)
    return NextResponse.json(
      { error: 'Failed to fetch variants' },
      { status: 500 }
    )
  }
} 