import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import TransactionModel from '@/lib/models/transaction'
import ProductModel from '@/lib/models/Product'
import WebhookProcessingModel from '@/lib/models/webhook-processing'
import crypto from 'crypto'

interface ShopifyTransaction {
  status: string
  receipt?: {
    processing_fee?: string
  }
}

interface ShopifyRefund {
  id: number
  note?: string
  transactions: Array<{
    amount: string
  }>
}

interface ShopifyLineItem {
  product_id: number
  title: string
  quantity: number
  price: string
  sku: string
  variant_id?: number
}

interface ShopifyOrder {
  id: number
  created_at: string
  name: string
  total_price: string
  total_tax: string
  cancelled_at?: string
  refunds?: ShopifyRefund[]
  transactions?: ShopifyTransaction[]
  line_items: ShopifyLineItem[]
  customer?: {
    first_name?: string
    last_name?: string
  }
  financial_status: string
}

// Verify Shopify webhook signature
async function verifyShopifyWebhook(request: Request): Promise<{ isValid: boolean; body: string }> {
  const hmac = request.headers.get('x-shopify-hmac-sha256')
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET

  if (!hmac || !secret) {
    console.error('Missing HMAC or webhook secret', { 
      hmacPresent: !!hmac, 
      secretPresent: !!secret,
      secretLength: secret?.length
    })
    return { isValid: false, body: '' }
  }

  try {
    // Get raw body as a buffer first
    const clonedRequest = request.clone()
    const bodyBuffer = Buffer.from(await clonedRequest.arrayBuffer())
    const rawBody = bodyBuffer.toString('utf8')

    // Calculate HMAC
    const calculatedHmac = crypto
      .createHmac('sha256', secret)
      .update(bodyBuffer)  // Use the raw buffer directly
      .digest('base64')

    const isValid = hmac === calculatedHmac

    console.log('Shopify webhook verification:', {
      provided: hmac,
      calculated: calculatedHmac,
      bodyLength: rawBody.length,
      isValid,
      bodyPreview: rawBody.substring(0, 100) + '...',
      secretPreview: `${secret.substring(0, 4)}...`
    })
    
    return { isValid, body: rawBody }
  } catch (error) {
    console.error('Error verifying Shopify webhook:', error)
    return { isValid: false, body: '' }
  }
}

export async function POST(request: Request) {
  let body: ShopifyOrder | undefined
  let topic: string | null = null
  try {
    console.log('Starting Shopify webhook processing...')
    
    // Start DB connection and signature verification in parallel
    const [, verificationResult] = await Promise.all([
      connectToDatabase().then(() => console.log('Database connected')),
      verifyShopifyWebhook(request)
    ])

    const { isValid, body: rawBody } = verificationResult

    if (!isValid) {
      console.log('Invalid webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    body = JSON.parse(rawBody) as ShopifyOrder
    topic = request.headers.get('x-shopify-topic')

    if (!topic) {
      console.log('Missing webhook topic')
      return NextResponse.json({ error: 'Missing topic' }, { status: 400 })
    }

    const orderId = body.id.toString()
    console.log(`Processing webhook for order ${orderId} with topic ${topic}`)

    // Check if we've already processed this webhook
    const existingProcessing = await WebhookProcessingModel.findOne({
      platform: 'shopify',
      orderId,
      topic,
      status: { $in: ['completed', 'processing'] }
    })

    if (existingProcessing) {
      console.log(`Found existing webhook processing record: ${existingProcessing.status}`)
      // If it's still processing, it might have timed out
      if (existingProcessing.status === 'processing' && 
          Date.now() - existingProcessing.lastAttempt.getTime() > 30000) { // 30 seconds
        console.log('Previous attempt timed out, resetting to pending')
        // Reset the status to pending for retry
        await WebhookProcessingModel.findByIdAndUpdate(existingProcessing._id, {
          status: 'pending',
          $inc: { attemptCount: 1 },
          lastAttempt: new Date()
        })
      } else {
        // Already processed or still processing
        console.log(`Webhook already ${existingProcessing.status}, skipping`)
        return NextResponse.json({ 
          success: true,
          message: `Webhook already ${existingProcessing.status}`
        })
      }
    }

    // Create or update webhook processing record
    console.log('Creating/updating webhook processing record')
    const webhookProcessing = await WebhookProcessingModel.findOneAndUpdate(
      { platform: 'shopify', orderId, topic },
      {
        status: 'processing',
        $inc: { attemptCount: 1 },
        lastAttempt: new Date(),
        data: body
      },
      { upsert: true, new: true }
    )
    console.log(`Webhook processing record ${webhookProcessing._id} created/updated`)

    switch (topic) {
      case 'orders/create':
      case 'orders/updated': {
        const order = body

        // Start all database operations in parallel
        console.log('Starting parallel database operations')
        const [existingTransaction, products] = await Promise.all([
          TransactionModel.findOne({
            'platformMetadata.orderId': orderId,
            'platformMetadata.platform': 'shopify'
          }),
          ProductModel.find({
            'platformMetadata.platform': 'shopify',
            'platformMetadata.productId': { 
              $in: order.line_items.map(item => item.product_id.toString()) 
            }
          }).lean()
        ])
        console.log(`Found ${products.length} products and ${existingTransaction ? 'existing' : 'no existing'} transaction`)

        // Create a map of product IDs to products for faster lookups
        const productMap = new Map(products.map(p => [p.platformMetadata.productId, p]))

        // Process line items using the product map
        const lineItems = order.line_items.map(item => {
          const product = productMap.get(item.product_id.toString())
          const unitPrice = Number(item.price)
          const quantity = item.quantity
          return {
            productId: product?._id,
            name: item.title,
            quantity,
            unitPrice,
            totalPrice: unitPrice * quantity,
            isTaxable: true,
            sku: item.sku,
            variantId: item.variant_id?.toString()
          }
        })

        // Determine transaction status
        let status: 'completed' | 'cancelled' | 'refunded' = 'completed'
        if (order.cancelled_at) {
          status = 'cancelled'
        } else if (order.refunds && order.refunds.length > 0) {
          status = 'refunded'
        }

        // Calculate tax amount and processing fees
        const taxAmount = Number(order.total_tax || 0)
        const processingFees = order.transactions
          ?.filter((t: ShopifyTransaction) => t.status === 'success')
          .reduce((sum: number, t: ShopifyTransaction) => sum + Number(t.receipt?.processing_fee || 0), 0) || 0

        const totalAmount = Number(order.total_price)
        const preTaxAmount = totalAmount - taxAmount

        const transaction = {
          date: new Date(order.created_at),
          customerName: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || 'Anonymous',
          description: `Shopify Order #${order.name}`,
          products: lineItems,
          amount: totalAmount,
          preTaxAmount,
          taxAmount,
          processingFees,
          type: 'sale',
          source: 'shopify',
          isTaxable: true,
          platformMetadata: {
            platform: 'shopify' as const,
            orderId,
            orderNumber: order.name,
            status: order.financial_status,
            data: {
              orderId: orderId,
              orderNumber: order.name,
              gateway: order.financial_status,
              createdAt: order.created_at,
              updatedAt: new Date().toISOString()
            },
            refunds: order.refunds?.map((refund: ShopifyRefund) => ({
              id: refund.id,
              amount: Number(refund.transactions[0]?.amount || 0),
              reason: refund.note || 'No reason provided'
            }))
          },
          status
        }

        // Fire and forget the database operation
        const dbOperation = existingTransaction
          ? TransactionModel.findByIdAndUpdate(existingTransaction._id, transaction).exec()
          : TransactionModel.create(transaction)

        // Don't wait for the operation to complete
        dbOperation.then(async () => {
          console.log(`${existingTransaction ? 'Updated' : 'Created'} Shopify transaction: ${orderId}`)
          // Update webhook processing status to completed
          await WebhookProcessingModel.findByIdAndUpdate(webhookProcessing._id, {
            status: 'completed'
          })
          console.log(`Webhook processing record ${webhookProcessing._id} marked as completed`)
        }).catch(async (error) => {
          console.error('Error saving transaction:', error)
          // Update webhook processing status to failed
          await WebhookProcessingModel.findByIdAndUpdate(webhookProcessing._id, {
            status: 'failed',
            error: error.message
          })
          console.log(`Webhook processing record ${webhookProcessing._id} marked as failed`)
        })

        // Return success immediately
        return NextResponse.json({ 
          success: true,
          message: `${existingTransaction ? 'Updating' : 'Creating'} transaction ${orderId}`
        })
      }

      default:
        console.log(`Unhandled webhook topic: ${topic}`)
        // Mark unhandled topics as completed
        await WebhookProcessingModel.findByIdAndUpdate(webhookProcessing._id, {
          status: 'completed'
        })
        return NextResponse.json({ message: 'Unhandled webhook topic' })
    }
  } catch (error) {
    console.error('Shopify webhook error:', error)
    // If we have a webhook processing record, mark it as failed
    if (error instanceof Error && body && topic) {
      console.log(`Marking webhook processing record as failed for order ${body.id}`)
      await WebhookProcessingModel.findOneAndUpdate(
        { platform: 'shopify', orderId: body.id.toString(), topic },
        {
          status: 'failed',
          error: error.message
        }
      )
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 