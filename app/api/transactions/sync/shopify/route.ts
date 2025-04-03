import { NextResponse } from 'next/server'
import { shopifyClient } from '@/lib/shopify'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import SyncStateModel from '@/lib/models/SyncState'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { startDate, endDate } = body
    
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
      status: 'any', // Include all order statuses
      limit: 250 // Maximum allowed by Shopify
    })

    console.log(`Found ${orders.length} Shopify orders since ${lastSyncTime}`)

    // Process each order
    const operations = orders.map(async (order) => {
      // Check if transaction already exists
      const existing = await mongoose.model('Transaction').findOne({
        'platformMetadata.platform': 'shopify',
        'platformMetadata.orderId': order.id.toString()
      })

      // Calculate tax amounts
      const totalAmount = Number(order.total_price)
      const taxAmount = Number(order.total_tax) || 0
      const preTaxAmount = totalAmount - taxAmount
      const shippingAmount = Number(order.total_shipping_price_set?.shop_money?.amount || 0)
      const discountAmount = Number(order.total_discounts || 0)

      // Calculate Shopify processing fee (2.9% + $0.30)
      const processingFee = Number((totalAmount * 0.029 + 0.30).toFixed(2))

      const transaction = {
        type: 'sale' as const,
        date: order.created_at,
        amount: totalAmount,
        preTaxAmount,
        taxAmount,
        shipping: shippingAmount,
        discount: discountAmount,
        status: order.financial_status === 'paid' ? 'completed' : 'pending',
        source: 'shopify' as const,
        customer: order.customer?.id ? `shopify_${order.customer.id}` : undefined,
        email: order.customer?.email,
        isTaxable: true,
        paymentProcessing: {
          fee: processingFee,
          provider: 'Shopify',
          transactionId: order.id.toString()
        },
        platformMetadata: {
          platform: 'shopify' as const,
          orderId: order.id.toString(),
          data: {
            orderId: order.id.toString(),
            orderNumber: order.order_number.toString(),
            gateway: order.gateway || 'unknown',
            createdAt: order.created_at,
            updatedAt: order.updated_at
          }
        },
        shopifyOrderId: order.id.toString(),
        shopifyTotalTax: taxAmount,
        shopifySubtotalPrice: preTaxAmount,
        shopifyTotalPrice: totalAmount,
        shopifyPaymentGateway: order.gateway,
        products: await Promise.all(order.line_items.map(async item => {
          // Try to find the MongoDB product using Shopify's product ID
          const product = item.product_id ? await mongoose.model('Product').findOne({
            'platformMetadata.platform': 'shopify',
            'platformMetadata.productId': item.product_id?.toString() || ''
          }) : null

          return {
            name: item.title,
            quantity: item.quantity,
            unitPrice: Number(item.price),
            totalPrice: Number(item.price) * item.quantity,
            isTaxable: true, // All Shopify products are taxable
            productId: product?._id || new mongoose.Types.ObjectId() // Use existing product ID if found, otherwise generate new one
          }
        }))
      }

      if (existing) {
        // If transaction exists but status has changed, update it
        if (existing.status !== transaction.status) {
          await mongoose.model('Transaction').findOneAndUpdate(
            { _id: existing._id },
            { 
              $set: { 
                status: transaction.status,
                updatedAt: transaction.platformMetadata.data.updatedAt
              } 
            },
            { new: true }
          )
          console.log(`Updated Shopify order ${order.id} status to ${transaction.status}`)
          return { action: 'updated', id: order.id }
        }
        console.log(`Shopify order ${order.id} already synced`)
        return { action: 'skipped', id: order.id }
      }

      // Create new transaction
      const newTransaction = await mongoose.model('Transaction').create({
        ...transaction,
        createdAt: new Date().toISOString()
      })

      console.log('Created transaction with platformMetadata:', {
        transactionId: newTransaction._id,
        orderId: order.id,
        platformMetadata: newTransaction.platformMetadata,
        fullTransaction: {
          ...newTransaction.toObject(),
          products: newTransaction.products.length + ' products'
        }
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