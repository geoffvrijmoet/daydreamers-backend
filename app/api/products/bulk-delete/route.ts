import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'

export async function POST(request: Request) {
  try {
    const { productIds } = await request.json()
    await connectToDatabase()
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }

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