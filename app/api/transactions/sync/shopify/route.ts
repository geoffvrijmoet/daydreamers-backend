import { NextResponse } from 'next/server'
import { shopifyClient } from '@/lib/shopify'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import SyncStateModel from '@/lib/models/SyncState'

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    
    await connectToDatabase()
    console.log('Starting Shopify transactions sync...')

    // Get last sync timestamp if no dates provided
    const syncState = await SyncStateModel.findOne({ source: 'shopify' })
    const lastSyncTime = startDate || syncState?.lastSuccessfulSync || '2023-01-01T00:00:00Z'
    const now = endDate || new Date().toISOString()

    console.log('Sync time range:', { start: lastSyncTime, end: now })

    // Get orders from Shopify since last sync
    const orders = await shopifyClient.order.list({
      created_at_min: lastSyncTime,
      created_at_max: now,
      status: 'any', // Get all orders including cancelled
      limit: 100
    })

    console.log(`Found ${orders.length} Shopify orders since ${lastSyncTime}`)

    // Process each order
    const operations = orders.map(async (order) => {
      const shopifyId = `shopify_${order.id}`

      // Check if transaction already exists
      const existing = await mongoose.model('Transaction').findOne({ id: shopifyId })

      // Determine transaction status
      let status: 'completed' | 'cancelled' | 'refunded' = 'completed'
      if (order.cancelled_at) {
        status = 'cancelled'
      } else if (order.refunds && order.refunds.length > 0) {
        status = 'refunded'
      }

      // Calculate tax amounts
      const TAX_RATE = 0.08875;
      const totalAmount = Number(order.total_price);
      
      // Calculate pre-tax amount
      const preTaxAmount = totalAmount / (1 + TAX_RATE);
      const calculatedTax = totalAmount - preTaxAmount;

      const transaction = {
        id: shopifyId,
        type: 'sale' as const,
        date: order.created_at,
        amount: totalAmount,
        preTaxAmount,
        taxAmount: calculatedTax,
        status,
        source: 'shopify' as const,
        customer: order.customer?.email,
        refundAmount: order.refunds?.[0]?.transactions?.[0]?.amount,
        refundDate: order.refunds?.[0]?.created_at,
        updatedAt: order.updated_at,
        products: order.line_items.map(item => ({
          name: item.title,
          quantity: item.quantity,
          unitPrice: Number(item.price),
          totalPrice: Number(item.price) * item.quantity
        }))
      }

      if (existing) {
        // If transaction exists but status has changed, update it
        if (existing.status !== status) {
          await mongoose.model('Transaction').findOneAndUpdate(
            { _id: existing._id },
            { 
              $set: { 
                status,
                refundAmount: transaction.refundAmount,
                refundDate: transaction.refundDate,
                updatedAt: transaction.updatedAt
              } 
            },
            { new: true }
          )
          console.log(`Updated Shopify order ${order.id} status to ${status}`)
          return { action: 'updated', id: order.id }
        }
        console.log(`Shopify order ${order.id} already synced`)
        return { action: 'skipped', id: order.id }
      }

      // Create new transaction
      await mongoose.model('Transaction').create({
        ...transaction,
        createdAt: new Date().toISOString()
      })
      console.log(`Synced Shopify order ${order.id}`)
      return { action: 'created', id: order.id }
    })

    const results = await Promise.all(operations)
    const created = results.filter(r => r.action === 'created').length
    const updated = results.filter(r => r.action === 'updated').length
    const skipped = results.filter(r => r.action === 'skipped').length

    // Update last successful sync time
    await SyncStateModel.findOneAndUpdate(
      { source: 'shopify' },
      { 
        $set: { 
          lastSuccessfulSync: now,
          lastSyncStatus: 'success',
          lastSyncResults: { created, updated, skipped },
          updatedAt: now
        }
      },
      { upsert: true, new: true }
    )

    return NextResponse.json({
      success: true,
      results: { created, updated, skipped }
    })
  } catch (error) {
    console.error('Error syncing Shopify transactions:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync transactions' },
      { status: 500 }
    )
  }
} 