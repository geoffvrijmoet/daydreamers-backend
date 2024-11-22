import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { CostHistoryEntry } from '@/types'
import { ObjectId } from 'mongodb'

export async function POST(request: Request) {
  try {
    const db = await getDb()
    const { productId, entry } = await request.json()
    
    const costEntry: CostHistoryEntry = {
      date: entry.date || new Date().toISOString(),
      quantity: Number(entry.quantity),
      unitPrice: Number(entry.unitPrice),
      totalPrice: Number(entry.quantity) * Number(entry.unitPrice),
      source: entry.source,
      invoiceId: entry.invoiceId,
      notes: entry.notes
    }

    // Update product with new cost history entry and recalculate averages
    const result = await db.collection('products').findOneAndUpdate(
      { _id: new ObjectId(productId) },
      {
        $push: { costHistory: costEntry },
        $inc: {
          totalPurchased: costEntry.quantity,
          totalSpent: costEntry.totalPrice,
          currentStock: costEntry.quantity // Update current stock
        },
        $set: {
          lastPurchasePrice: costEntry.unitPrice,
          lastRestockDate: costEntry.date,
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

    // Calculate new average cost
    const averageCost = result.totalSpent / result.totalPurchased

    // Update the average cost
    await db.collection('products').updateOne(
      { _id: new ObjectId(productId) },
      {
        $set: {
          averageCost: averageCost
        }
      }
    )

    return NextResponse.json({ 
      success: true,
      averageCost,
      costHistory: result.costHistory,
      currentStock: result.currentStock
    })
  } catch (error) {
    console.error('Error adding cost history:', error)
    return NextResponse.json(
      { error: 'Failed to add cost history' },
      { status: 500 }
    )
  }
} 