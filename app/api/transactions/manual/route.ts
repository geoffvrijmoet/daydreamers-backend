import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { fromEasternTime } from '@/lib/utils/dates'

export async function POST(request: Request) {
  try {
    const db = await getDb()
    const data = await request.json()

    // The frontend now sends us:
    // - preTaxAmount: total amount before tax (products + shipping)
    // - taxAmount: calculated tax amount
    // - amount: final total including tax and tip
    
    // The date from the form is already in Eastern time, so we should store it as is
    const now = fromEasternTime(new Date())
    const transaction = {
      ...data,
      date: data.date, // Don't convert the date since it's already in Eastern time
      createdAt: now,
      updatedAt: now
    }

    await db.collection('transactions').insertOne(transaction)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error creating manual transaction:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create transaction' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const db = await getDb()
    const { id, ...updates } = await request.json()

    // Convert any dates to UTC while treating them as Eastern Time
    const updateData = {
      ...updates,
      date: updates.date ? fromEasternTime(updates.date) : undefined,
      updatedAt: fromEasternTime(new Date())
    }

    const result = await db.collection('transactions').findOneAndUpdate(
      { id },
      { 
        $set: updateData
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, transaction: result })
  } catch (error) {
    console.error('Error updating transaction:', error)
    return NextResponse.json(
      { error: 'Failed to update transaction' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    const db = await getDb()

    const result = await db.collection('transactions').deleteOne({ id })

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting transaction:', error)
    return NextResponse.json(
      { error: 'Failed to delete transaction' },
      { status: 500 }
    )
  }
} 