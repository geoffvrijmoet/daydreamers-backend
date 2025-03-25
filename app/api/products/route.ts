import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import ProductModel from '@/lib/models/Product'
import { FilterQuery } from 'mongoose'

export async function GET(request: Request) {
  try {
    await connectToDatabase()
    
    // Get query parameters
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const active = searchParams.get('active')
    const sortBy = searchParams.get('sortBy') || 'name'
    const sortOrder = searchParams.get('sortOrder') || 'asc'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Build query
    const query: FilterQuery<typeof ProductModel> = {}
    
    if (category) {
      query.category = category
    }
    
    if (active !== null) {
      query.active = active === 'true'
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { baseProductName: { $regex: search, $options: 'i' } },
        { variantName: { $regex: search, $options: 'i' } }
      ]
    }

    // Build sort object
    const sort: Record<string, 1 | -1> = {}
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1

    // Execute query with pagination
    const skip = (page - 1) * limit
    const [products, total] = await Promise.all([
      ProductModel.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      ProductModel.countDocuments(query)
    ])

    return NextResponse.json({
      products,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    })
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
    await connectToDatabase()
    const body = await request.json()

    // Validate required fields
    const requiredFields = ['baseProductName', 'variantName', 'category', 'sku', 'price']
    const missingFields = requiredFields.filter(field => !body[field])
    
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      )
    }

    // Check for duplicate SKU
    const existingProduct = await ProductModel.findOne({ sku: body.sku })
    if (existingProduct) {
      return NextResponse.json(
        { error: 'Product with this SKU already exists' },
        { status: 400 }
      )
    }

    // Create new product
    const product = await ProductModel.create({
      ...body,
      name: `${body.baseProductName}${body.variantName !== 'Default' ? ` - ${body.variantName}` : ''}`,
      stock: body.stock || 0,
      minimumStock: body.minimumStock || 5,
      lastPurchasePrice: body.lastPurchasePrice || 0,
      averageCost: body.averageCost || 0,
      totalSpent: body.totalSpent || 0,
      totalPurchased: body.totalPurchased || 0,
      active: body.active !== false,
      isProxied: body.isProxied || false,
      costHistory: body.costHistory || [],
      platformMetadata: body.platformMetadata || [],
      syncStatus: {
        lastSyncAttempt: null,
        lastSuccessfulSync: null,
        errors: []
      }
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    await connectToDatabase()
    const { id, ...updates } = await request.json()

    const product = await ProductModel.findByIdAndUpdate(
      id,
      { 
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      },
      { new: true }
    )

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
} 