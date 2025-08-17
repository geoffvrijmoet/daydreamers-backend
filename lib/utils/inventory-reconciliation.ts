import mongoose from 'mongoose'
import { InventoryChangeModel } from '@/lib/models/inventory-change'

export interface InventoryReconciliationResult {
  productId: string
  productName: string
  currentStock: number
  calculatedStock: number
  difference: number
  totalPurchases: number
  totalSales: number
  lastUpdated: Date
}

/**
 * Calculates the correct inventory level for a product based on all historical changes
 */
export async function calculateInventoryFromHistory(
  productId: string
): Promise<InventoryReconciliationResult | null> {
  try {
    // Get the product to find current stock and name
    const product = await mongoose.connection.db!.collection('products').findOne({
      _id: new mongoose.Types.ObjectId(productId),
      supplier: 'Viva Raw'
    })

    if (!product) {
      return null
    }

    // Get all inventory changes for this product
    const changes = await InventoryChangeModel.find({
      productId: new mongoose.Types.ObjectId(productId)
    }).sort({ timestamp: 1 })

    let totalPurchases = 0
    let totalSales = 0

    for (const change of changes) {
      if (change.quantityChange > 0) {
        totalPurchases += change.quantityChange
      } else {
        totalSales += Math.abs(change.quantityChange)
      }
    }

    const calculatedStock = totalPurchases - totalSales
    const currentStock = product.stock || 0
    const difference = calculatedStock - currentStock

    return {
      productId,
      productName: product.name,
      currentStock,
      calculatedStock,
      difference,
      totalPurchases,
      totalSales,
      lastUpdated: product.updatedAt || new Date()
    }
  } catch (error) {
    console.error(`Error calculating inventory for product ${productId}:`, error)
    return null
  }
}

/**
 * Reconciles inventory for all Viva Raw products
 */
export async function reconcileAllInventory(): Promise<InventoryReconciliationResult[]> {
  try {
    // Get all Viva Raw products
    const products = await mongoose.connection.db!.collection('products').find({
      supplier: 'Viva Raw'
    }).toArray()

    const results: InventoryReconciliationResult[] = []

    for (const product of products) {
      const reconciliation = await calculateInventoryFromHistory(product._id.toString())
      if (reconciliation) {
        results.push(reconciliation)
      }
    }

    return results
  } catch (error) {
    console.error('Error reconciling inventory:', error)
    return []
  }
}

/**
 * Updates product stock to match calculated inventory from history
 */
export async function updateInventoryToCalculated(
  productId: string,
  calculatedStock: number
): Promise<boolean> {
  try {
    const result = await mongoose.connection.db!.collection('products').updateOne(
      { _id: new mongoose.Types.ObjectId(productId) },
      { 
        $set: { 
          stock: Math.max(0, calculatedStock), // Prevent negative stock
          updatedAt: new Date() 
        } 
      }
    )

    return result.modifiedCount > 0
  } catch (error) {
    console.error(`Error updating inventory for product ${productId}:`, error)
    return false
  }
}

/**
 * Creates a manual inventory adjustment record
 */
export async function createManualAdjustment(
  productId: string,
  adjustment: number,
  reason: string,
  userId?: string
): Promise<boolean> {
  try {
    await InventoryChangeModel.create({
      transactionId: new mongoose.Types.ObjectId(), // Generate a new ID for manual adjustments
      productId: new mongoose.Types.ObjectId(productId),
      quantityChange: adjustment,
      changeType: 'adjustment',
      productName: 'Manual Adjustment', // Will be updated with actual product name
      transactionType: 'sale', // Not really a sale, but needed for the schema
      source: 'manual-adjustment',
      timestamp: new Date(),
      notes: `${reason}${userId ? ` (by user ${userId})` : ''}`
    })

    return true
  } catch (error) {
    console.error(`Error creating manual adjustment for product ${productId}:`, error)
    return false
  }
}
