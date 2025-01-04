import { NextResponse } from 'next/server'
import { shopifyClient } from '@/lib/shopify'
import { getDb } from '@/lib/db'
import { Transaction } from '@/types'

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    
    const db = await getDb()
    console.log('Starting Shopify transactions sync...')

    // Get last sync timestamp if no dates provided
    const syncState = await db.collection('syncState').findOne({ source: 'shopify' })
    const lastSyncTime = startDate || syncState?.lastSuccessfulSync || '2023-01-01T00:00:00Z'
    const now = endDate || new Date().toISOString()

    console.log('Sync time range:', { start: lastSyncTime, end: now })

    // Get orders from Shopify since last sync
    const orders = await shopifyClient.order.list({
      created_at_min: lastSyncTime,
      created_at_max: now,
      status: 'any',
      limit: 100
    })

    console.log(`Found ${orders.length} new Shopify orders since ${lastSyncTime}`)

    // Process each order
    const operations = orders.map(async (order) => {
      const shopifyId = `shopify_${order.id}`

      // Check if transaction already exists
      const existing = await db.collection('transactions').findOne({ id: shopifyId })
      if (existing) {
        console.log(`Shopify order ${order.id} already synced`)
        return { action: 'skipped', id: order.id }
      }

      const transaction: Omit<Transaction, '_id'> = {
        id: shopifyId,
        date: order.created_at ?? new Date().toISOString(),
        type: 'sale',
        amount: Number(order.total_price),
        preTaxAmount: Number(order.subtotal_price),
        taxAmount: Number(order.total_tax),
        description: order.line_items?.[0]?.title 
          ? `Shopify: ${order.line_items[0].title}${order.line_items.length > 1 ? ` (+${order.line_items.length - 1} more)` : ''}`
          : `Shopify Order #${order.order_number}`,
        source: 'shopify',
        line_items: order.line_items?.map(item => ({
          name: item.title,
          quantity: item.quantity,
          price: Number(item.price),
          sku: item.sku,
          variant_id: item.variant_id?.toString()
        })),
        customer: `${order.customer?.first_name} ${order.customer?.last_name}`.trim(),
        paymentMethod: order.gateway,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await db.collection('transactions').insertOne(transaction)
      console.log(`Synced Shopify order ${order.id}`)
      return { action: 'created', id: order.id }
    })

    const results = await Promise.all(operations)
    const created = results.filter(r => r.action === 'created').length
    const skipped = results.filter(r => r.action === 'skipped').length

    // Update last successful sync time
    await db.collection('syncState').updateOne(
      { source: 'shopify' },
      { 
        $set: { 
          lastSuccessfulSync: now,
          lastSyncStatus: 'success',
          lastSyncResults: { created, skipped },
          updatedAt: now
        }
      },
      { upsert: true }
    )

    console.log('Shopify sync complete:', { created, skipped })

    return NextResponse.json({
      message: `Sync complete. Created: ${created}, Skipped: ${skipped} transactions`,
      details: results
    })

  } catch (error) {
    console.error('Error syncing Shopify transactions:', error)
    
    // Update sync state with error
    const db = await getDb()
    await db.collection('syncState').updateOne(
      { source: 'shopify' },
      { 
        $set: { 
          lastSyncStatus: 'error',
          lastError: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    )

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync transactions' },
      { status: 500 }
    )
  }
} 