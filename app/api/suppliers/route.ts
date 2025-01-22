import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = await getDb()
    const suppliers = await db.collection('suppliers')
      .find({})
      .sort({ name: 1 })
      .toArray()

    return NextResponse.json({ suppliers })
  } catch (error) {
    console.error('Error fetching suppliers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch suppliers' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
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

    // Check if supplier with same name already exists
    const existing = await db.collection('suppliers').findOne({ name })
    if (existing) {
      return NextResponse.json(
        { error: 'A supplier with this name already exists' },
        { status: 400 }
      )
    }

    // Create new supplier
    const now = new Date()
    const result = await db.collection('suppliers').insertOne({
      name,
      aliases: aliases || [],
      invoiceEmail,
      invoiceSubjectPattern,
      skuPrefix,
      createdAt: now,
      updatedAt: now
    })

    return NextResponse.json({ 
      success: true,
      supplier: {
        _id: result.insertedId,
        name,
        aliases,
        invoiceEmail,
        invoiceSubjectPattern,
        skuPrefix,
        createdAt: now,
        updatedAt: now
      }
    })
  } catch (error) {
    console.error('Error creating supplier:', error)
    return NextResponse.json(
      { error: 'Failed to create supplier' },
      { status: 500 }
    )
  }
} 