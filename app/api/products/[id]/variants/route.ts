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
    
    // First get the product to find its Square/Shopify parent ID
    const product = await db.collection<Product>('products').findOne({ 
      _id: new ObjectId(params.id) as unknown as string
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Build query to find all related variants
    const query: { $or: Array<Record<string, string>> } = { $or: [] }
    
    if (product.squareId) {
      // This is a base product, find all products that reference it as parent
      query.$or.push({ squareParentId: product.squareId })
    } 
    if (product.squareParentId) {
      // This is a variant, find all products with same parent including the parent
      query.$or.push(
        { squareId: product.squareParentId },
        { squareParentId: product.squareParentId }
      )
    }
    if (product.shopifyId) {
      // This is a base product, find all products that reference it as parent
      const parentId = product.shopifyId.split('/').pop()?.split('_')[0]
      if (parentId) {
        query.$or.push({ shopifyParentId: parentId })
      }
    }
    if (product.shopifyParentId) {
      // This is a variant, find all products with same parent including the parent
      query.$or.push(
        { shopifyId: product.shopifyParentId },
        { shopifyParentId: product.shopifyParentId }
      )
    }

    // If no variant relationships found, return empty array
    if (query.$or.length === 0) {
      return NextResponse.json({ variants: [] })
    }

    // Find all variants
    const variants = await db.collection<Product>('products')
      .find(query)
      .toArray()
    
    // Map _id to id for frontend and exclude the current product
    const mappedVariants = variants
      .filter(v => v._id.toString() !== params.id)
      .map(variant => ({
        ...variant,
        id: variant._id.toString()
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