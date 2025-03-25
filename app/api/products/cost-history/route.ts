import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { ObjectId, Db } from 'mongodb'

type CostHistoryEntry = {
  invoiceId: string
  date: string
  quantity: number
  unitPrice: number
  totalPrice: number
  source: string
  notes?: string
}

// Helper function to clean up duplicate entries
async function cleanupDuplicateEntries(db: Db, productId: string) {
  const product = await db.collection('products').findOne({ 
    _id: new ObjectId(productId) 
  })

  if (!product?.costHistory?.length) return

  // Group entries by invoiceId
  const entriesByInvoice = product.costHistory.reduce((acc: { [key: string]: CostHistoryEntry[] }, entry: CostHistoryEntry) => {
    if (!entry.invoiceId) return acc
    if (!acc[entry.invoiceId]) {
      acc[entry.invoiceId] = []
    }
    acc[entry.invoiceId].push(entry)
    return acc
  }, {})

  // Find invoiceIds with multiple entries
  type InvoiceEntry = [string, CostHistoryEntry[]]
  const duplicates = (Object.entries(entriesByInvoice)
    .filter(([, entries]) => (entries as CostHistoryEntry[]).length > 1)) as InvoiceEntry[]

  if (duplicates.length === 0) {
    console.log('No duplicate entries found for product:', productId)
    return
  }

  console.log('Found duplicate entries:', {
    productId,
    duplicateInvoices: duplicates.map(([invoiceId, entries]) => ({
      invoiceId,
      count: entries.length
    }))
  })

  // Combine duplicate entries
  const updatedCostHistory = product.costHistory.reduce((acc: CostHistoryEntry[], entry: CostHistoryEntry) => {
    if (!entry.invoiceId) {
      acc.push(entry)
      return acc
    }

    // If we've already processed this invoiceId, skip
    if (acc.some(e => e.invoiceId === entry.invoiceId)) {
      return acc
    }

    // Get all entries for this invoiceId
    const duplicateEntries = entriesByInvoice[entry.invoiceId]
    if (duplicateEntries.length === 1) {
      acc.push(entry)
      return acc
    }

    // Combine the entries
    const combinedEntry = {
      ...entry,
      quantity: duplicateEntries.reduce((sum: number, e: CostHistoryEntry) => sum + e.quantity, 0),
      totalPrice: duplicateEntries.reduce((sum: number, e: CostHistoryEntry) => sum + e.totalPrice, 0)
    }
    // Recalculate unit price
    combinedEntry.unitPrice = Number((combinedEntry.totalPrice / combinedEntry.quantity).toFixed(2))

    console.log('Combined duplicate entries:', {
      invoiceId: entry.invoiceId,
      originalEntries: duplicateEntries,
      combinedEntry
    })

    acc.push(combinedEntry)
    return acc
  }, [])

  // Update the product with cleaned up cost history
  const result = await db.collection('products').updateOne(
    { _id: new ObjectId(productId) },
    { $set: { costHistory: updatedCostHistory } }
  )

  console.log('Updated cost history after cleanup:', {
    productId,
    originalCount: product.costHistory.length,
    newCount: updatedCostHistory.length,
    modified: result.modifiedCount
  })

  // Recalculate stats after cleanup
  if (updatedCostHistory.length > 0) {
    const sortedHistory = [...updatedCostHistory].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    const lastEntry = sortedHistory[0]

    const totalSpent = updatedCostHistory.reduce((sum: number, entry: { totalPrice: number }) => 
      sum + entry.totalPrice, 0
    )
    const totalPurchased = updatedCostHistory.reduce((sum: number, entry: { quantity: number }) => 
      sum + entry.quantity, 0
    )

    await db.collection('products').updateOne(
      { _id: new ObjectId(productId) },
      {
        $set: {
          lastPurchasePrice: lastEntry.unitPrice,
          totalSpent,
          totalPurchased,
          updatedAt: new Date().toISOString()
        }
      }
    )

    console.log('Updated product stats after cleanup:', {
      productId,
      lastPurchasePrice: lastEntry.unitPrice,
      totalSpent,
      totalPurchased
    })
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase()
    const { productId, entry } = await request.json()

    console.log('Processing cost history update:', {
      productId,
      entry
    })

    // Validation
    if (!productId || !entry) {
      console.error('Missing required fields:', { productId, entry })
      return NextResponse.json(
        { error: 'Product ID and cost history entry are required' },
        { status: 400 }
      )
    }

    // Get the current product to access its cost history
    const product = await (mongoose.connection.db as Db).collection('products').findOne({
      _id: new ObjectId(productId)
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Check if an entry with this invoiceId already exists
    const existingEntryIndex = product.costHistory?.findIndex(
      (e: CostHistoryEntry) => e.invoiceId === entry.invoiceId
    )

    if (existingEntryIndex !== -1) {
      console.log('Found existing entry for invoice:', entry.invoiceId)
      // Update existing entry
      product.costHistory[existingEntryIndex] = entry
    } else {
      console.log('No existing entry found, adding new entry')
      // Add new entry
      product.costHistory = [...(product.costHistory || []), entry]
    }

    // Calculate new totals
    const totalSpent = product.costHistory.reduce(
      (sum: number, entry: CostHistoryEntry) => sum + entry.totalPrice,
      0
    )
    const totalPurchased = product.costHistory.reduce(
      (sum: number, entry: CostHistoryEntry) => sum + entry.quantity,
      0
    )
    const averageCost = totalPurchased > 0 ? totalSpent / totalPurchased : 0

    // Update the product with new cost history and calculated fields
    const result = await (mongoose.connection.db as Db).collection('products').updateOne(
      { _id: new ObjectId(productId) },
      {
        $set: {
          costHistory: product.costHistory,
          totalSpent,
          totalPurchased,
          averageCost,
          lastPurchasePrice: entry.unitPrice,
          updatedAt: new Date().toISOString()
        }
      }
    )

    console.log('Updated product with new totals:', {
      productId,
      totalSpent,
      totalPurchased,
      averageCost,
      lastPurchasePrice: entry.unitPrice,
      matched: result.matchedCount,
      modified: result.modifiedCount
    })

    // Clean up any duplicate entries that might exist
    await cleanupDuplicateEntries(mongoose.connection.db as Db, productId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating cost history:', error)
    return NextResponse.json(
      { error: 'Failed to update cost history' },
      { status: 500 }
    )
  }
} 