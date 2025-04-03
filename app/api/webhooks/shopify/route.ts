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
    console.log('Starting parallel operations: DB connection and signature verification')
    const [, verificationResult] = await Promise.all([
      connectToDatabase().then(() => console.log('Database connected')),
      verifyShopifyWebhook(request)
    ])
    console.log('Parallel operations completed')

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
    console.log('Checking for existing webhook processing record...')
    const existingProcessing = await WebhookProcessingModel.findOne({
      platform: 'shopify',
      orderId,
      topic,
      status: { $in: ['completed', 'processing'] }
    })
    console.log('Existing record check completed')

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
        console.log('Reset completed')
      } else {
        // Already processed or still processing
        console.log(`Webhook already ${existingProcessing.status}, skipping`)
        return NextResponse.json({ 
          success: true,
          message: `Webhook already ${existingProcessing.status}`
        })
      }
    } else {
      console.log('No existing webhook processing record found')
    }

    // Create or update webhook processing record
    console.log('Creating/updating webhook processing record...')
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
        console.log('Processing order data...')

        // Start all database operations in parallel
        console.log('Starting parallel database operations...')
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
        console.log('Product map created')

        // Calculate processing fees and tax amounts
        const processingFee = Number(order.total_price) * 0.029 + 0.30 // 2.9% + $0.30
        const taxAmount = Number(order.total_tax) || 0
        console.log(`Calculated processing fee: ${processingFee}, tax amount: ${taxAmount}`)

        // Create transaction object
        const transaction = {
          source: 'shopify',
          type: 'sale',
          amount: order.total_price,
          processingFee,
          taxAmount,
          platformMetadata: {
            platform: 'shopify',
            orderId: orderId,
            data: order
          },
          lineItems: order.line_items.map(item => {
            const product = productMap.get(item.product_id.toString())
            return {
              productId: product?._id,
              name: item.title,
              quantity: item.quantity,
              price: item.price,
              sku: item.sku,
              variantId: item.variant_id?.toString(),
              productName: product?.name || item.title,
              category: product?.category || 'Uncategorized'
            }
          })
        }
        console.log('Transaction object created')

        // Fire and forget the database operation
        console.log('Starting transaction save operation...')
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
        console.log('Returning success response')
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