import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { type IProduct } from '@/lib/models/Product'

export async function GET() {
  try {
    const db = await getDb()
    
    console.log('Fetching products from MongoDB...')
    const products = await db.collection<IProduct>('products').find({}).toArray()
    console.log(`Found ${products.length} products`)

    // Map _id to id and transform the data for frontend consumption
    const mappedProducts = products.map(product => ({
      id: (product._id as ObjectId).toString(),
      name: product.name,
      description: product.description,
      category: product.category,
      retailPrice: product.retailPrice,
      currentStock: product.currentStock,
      minimumStock: product.minimumStock,
      lastPurchasePrice: product.lastPurchasePrice,
      averageCost: product.averageCost,
      supplier: product.supplier,
      isProxied: product.isProxied,
      proxyOf: product.proxyOf,
      proxyRatio: product.proxyRatio,
      costHistory: product.costHistory.map(entry => ({
        ...entry,
        date: entry.date.toISOString()
      })),
      totalSpent: product.totalSpent,
      totalPurchased: product.totalPurchased,
      lastRestockDate: product.lastRestockDate?.toISOString(),
      active: product.active,
      variants: product.variants.map(variant => ({
        name: variant.name,
        sku: variant.sku,
        barcode: variant.barcode,
        price: variant.price,
        stock: variant.stock,
        platformMetadata: variant.platformMetadata.map(meta => ({
          ...meta,
          lastSyncedAt: meta.lastSyncedAt.toISOString()
        }))
      })),
      platformMetadata: product.platformMetadata.map(meta => ({
        ...meta,
        lastSyncedAt: meta.lastSyncedAt.toISOString()
      })),
      syncStatus: {
        lastSyncAttempt: product.syncStatus.lastSyncAttempt.toISOString(),
        lastSuccessfulSync: product.syncStatus.lastSuccessfulSync.toISOString(),
        errors: product.syncStatus.errors.map(error => ({
          ...error,
          date: error.date.toISOString()
        }))
      },
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString()
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
    const productData = await request.json()

    // Create the new product with default values
    const newProduct: Partial<IProduct> = {
      name: productData.name,
      description: productData.description || '',
      category: productData.category || '',
      retailPrice: productData.retailPrice,
      currentStock: productData.currentStock || 0,
      minimumStock: productData.minimumStock || 5,
      lastPurchasePrice: productData.lastPurchasePrice || 0,
      averageCost: productData.averageCost || 0,
      supplier: productData.supplier || '',
      isProxied: productData.isProxied || false,
      proxyOf: productData.proxyOf,
      proxyRatio: productData.proxyRatio,
      costHistory: [],
      totalSpent: 0,
      totalPurchased: 0,
      active: productData.active ?? true,
      variants: [{
        name: 'Default',
        sku: productData.sku,
        barcode: productData.barcode,
        price: productData.retailPrice,
        stock: productData.currentStock || 0,
        platformMetadata: []
      }],
      platformMetadata: [],
      syncStatus: {
        lastSyncAttempt: new Date(),
        lastSuccessfulSync: new Date(),
        errors: []
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const result = await db.collection<IProduct>('products').insertOne(newProduct as IProduct)
    
    // Return the created product with the new _id
    return NextResponse.json({ 
      id: (result.insertedId as ObjectId).toString(),
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