import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { ObjectId } from 'mongodb'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getDb()
    const supplier = await db.collection('suppliers').findOne({
      _id: new ObjectId(params.id)
    })

    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(supplier)
  } catch (error) {
    console.error('Error fetching supplier:', error)
    return NextResponse.json(
      { error: 'Failed to fetch supplier' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { name, aliases, invoiceEmail, invoiceSubjectPattern, skuPrefix } = body

    // Validate required fields
    if (!name || !invoiceEmail || !invoiceSubjectPattern || !skuPrefix) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const db = await getDb()

    // Check if another supplier with the same name exists (excluding current supplier)
    const existing = await db.collection('suppliers').findOne({
      _id: { $ne: new ObjectId(params.id) },
      name
    })
    if (existing) {
      return NextResponse.json(
        { error: 'A supplier with this name already exists' },
        { status: 400 }
      )
    }

    // Update supplier
    const result = await db.collection('suppliers').findOneAndUpdate(
      { _id: new ObjectId(params.id) },
      {
        $set: {
          name,
          aliases: aliases || [],
          invoiceEmail,
          invoiceSubjectPattern,
          skuPrefix,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error updating supplier:', error)
    return NextResponse.json(
      { error: 'Failed to update supplier' },
      { status: 500 }
    )
  }
} 