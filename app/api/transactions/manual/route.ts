import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { ObjectId } from 'mongodb'

export async function POST(request: Request) {
  try {
    const db = await getDb()
    const transaction = await request.json()

    // Ensure date is in NY timezone and includes timezone offset
    const date = new Date(transaction.date)
    const nyDate = new Date(date.toLocaleString('en-US', {
      timeZone: 'America/New_York'
    }))
    const nyDateString = nyDate.toISOString().replace('Z', '-05:00')

    // Add metadata
    const newTransaction = {
      ...transaction,
      id: `manual_${Date.now()}`,
      source: 'manual',
      date: nyDateString,  // Store with -05:00 timezone
      createdAt: new Date().toISOString().replace('Z', '-05:00'),
      customer: transaction.customer || null
    }

    // Store in database
    await db.collection('transactions').insertOne(newTransaction)

    return NextResponse.json({ success: true, transaction: newTransaction })
  } catch (error) {
    console.error('Error adding manual transaction:', error)
    return NextResponse.json(
      { error: 'Failed to add transaction' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const db = await getDb()
    const { id, ...updates } = await request.json()

    // If date is being updated, ensure it's in NY timezone
    if (updates.date) {
      const date = new Date(updates.date)
      const nyDate = new Date(date.toLocaleString('en-US', {
        timeZone: 'America/New_York'
      }))
      updates.date = nyDate.toISOString().replace('Z', '-05:00')
    }

    const result = await db.collection('transactions').findOneAndUpdate(
      { id },
      { 
        $set: {
          ...updates,
          updatedAt: new Date().toISOString().replace('Z', '-05:00')
        }
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