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
      status: 'any', // Get all orders including cancelled
      limit: 100
    })

    console.log(`Found ${orders.length} Shopify orders since ${lastSyncTime}`)

    // Process each order
    const operations = orders.map(async (order) => {
      const shopifyId = `shopify_${order.id}`

      // Check if transaction already exists
      const existing = await db.collection('transactions').findOne({ id: shopifyId })

      // Determine transaction status
      let status: 'completed' | 'cancelled' | 'refunded' = 'completed'
      if (order.cancelled_at) {
        status = 'cancelled'
      } else if (order.refunds?.length > 0) {
        status = 'refunded'
      }

      // Get transaction fees
      let processingFee = 0;
      try {
        const transactions = await shopifyClient.transaction.list(order.id);
        // Find the successful payment transaction
        interface ShopifyTransaction {
          status: string;
          kind: string;
          net_payment?: number;
        }
        const paymentTransaction = transactions.find(t => 
          t.status === 'success' && 
          t.kind === 'sale' && 
          (t as ShopifyTransaction).net_payment !== undefined
        ) as ShopifyTransaction | undefined;
        
        if (paymentTransaction) {
          // Processing fee is the difference between total price and net payment
          const totalAmount = Number(order.total_price);
          const netPayment = Number(paymentTransaction.net_payment);
          processingFee = totalAmount - netPayment;
          
          console.log(`[Shopify Sync] Found processing fees for order ${order.id}:`, {
            orderTotal: totalAmount,
            netPayment: netPayment,
            processingFee: processingFee.toFixed(2)
          });
        } else {
          console.log(`[Shopify Sync] No payment transaction found for order ${order.id}`);
        }
      } catch (err) {
        console.error(`[Shopify Sync] Error fetching transaction fees for order ${order.id}:`, err);
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
        lineItems: order.line_items?.map(item => ({
          name: item.title,
          quantity: item.quantity,
          price: Number(item.price),
          sku: item.sku,
          variant_id: item.variant_id?.toString()
        })),
        customer: `${order.customer?.first_name} ${order.customer?.last_name}`.trim(),
        paymentMethod: order.gateway,
        status,
        refundAmount: order.refunds?.reduce((sum, refund) => 
          sum + Number(refund.transactions?.[0]?.amount || 0), 0) || undefined,
        refundDate: order.refunds?.[0]?.created_at,
        shopifyOrderId: order.id.toString(),
        shopifyTotalTax: Number(order.total_tax),
        shopifySubtotalPrice: Number(order.subtotal_price),
        shopifyTotalPrice: Number(order.total_price),
        shopifyProcessingFee: processingFee,
        shopifyPaymentGateway: order.gateway,
        createdAt: order.created_at ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      if (existing) {
        // If transaction exists but status has changed, update it
        if (existing.status !== status) {
          await db.collection('transactions').updateOne(
            { _id: existing._id },
            { 
              $set: { 
                status,
                refundAmount: transaction.refundAmount,
                refundDate: transaction.refundDate,
                updatedAt: transaction.updatedAt
              } 
            }
          )
          console.log(`Updated Shopify order ${order.id} status to ${status}`)
          return { action: 'updated', id: order.id }
        }
        console.log(`Shopify order ${order.id} already synced`)
        return { action: 'skipped', id: order.id }
      }

      // Create new transaction
      await db.collection('transactions').insertOne({
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
    await db.collection('syncState').updateOne(
      { source: 'shopify' },
      { 
        $set: { 
          lastSuccessfulSync: now,
          lastSyncStatus: 'success',
          lastSyncResults: { created, updated, skipped },
          updatedAt: now
        }
      },
      { upsert: true }
    )

    console.log('Shopify sync complete:', { created, updated, skipped })

    return NextResponse.json({
      message: `Sync complete. Created: ${created}, Updated: ${updated}, Skipped: ${skipped} transactions`,
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