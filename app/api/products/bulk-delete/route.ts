import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { ObjectId } from 'mongodb'

export async function POST(request: Request) {
  try {
    const { productIds } = await request.json()
    const db = await getDb()

    console.log('Attempting to delete products:', productIds)

    // Convert string IDs to ObjectIds
    const objectIds = productIds.map((id: string) => new ObjectId(id))

    // Delete the products
    const result = await db.collection('products').deleteMany({
      _id: { $in: objectIds }
    })

    console.log('Deletion result:', {
      matched: result.deletedCount,
      productIds: productIds.length
    })

    return NextResponse.json({ 
      success: true,
      deletedCount: result.deletedCount
    })
  } catch (error) {
    console.error('Error bulk deleting products:', error)
    return NextResponse.json(
      { error: 'Failed to delete products' },
      { status: 500 }
    )
  }
} 