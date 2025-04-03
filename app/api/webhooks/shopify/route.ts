import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import TransactionModel from '@/lib/models/transaction'
import ProductModel from '@/lib/models/Product'
import crypto from 'crypto'

// Types
interface ShopifyLineItem {
  product_id: number
  title: string
  quantity: number
  price: string
  sku: string
  variant_id?: number
}

interface ShopifyWebhookBody {
  id: number
  total_price: string
  total_tax: string
  line_items: ShopifyLineItem[]
  [key: string]: unknown
}

// Explicitly set runtime to nodejs
export const runtime = 'nodejs'

// Verify Shopify webhook signature
async function verifyShopifyWebhook(request: Request): Promise<{ isValid: boolean; body: string }> {
  const hmac = request.headers.get('x-shopify-hmac-sha256')
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET

  if (!hmac || !secret) {
    return { isValid: false, body: '' }
  }

  try {
    const clonedRequest = request.clone()
    const bodyBuffer = Buffer.from(await clonedRequest.arrayBuffer())
    const rawBody = bodyBuffer.toString('utf8')
    const calculatedHmac = crypto
      .createHmac('sha256', secret)
      .update(bodyBuffer)
      .digest('base64')

    return { isValid: hmac === calculatedHmac, body: rawBody }
  } catch (error) {
    console.error('Error verifying Shopify webhook:', error)
    return { isValid: false, body: '' }
  }
}

// Process webhook data in the background
async function processWebhookData(webhookId: string, topic: string, orderId: string, body: ShopifyWebhookBody) {
  try {
    const { db } = await connectToDatabase()
    
    // Create webhook processing record
    const now = new Date()
    await db.collection('webhook_processing').insertOne({
      platform: 'shopify',
      orderId,
      topic,
      webhookId,
      status: 'processing',
      attemptCount: 1,
      lastAttempt: now,
      data: body,
      createdAt: now,
      updatedAt: now
    })

    // Process order data
    if (topic === 'orders/create' || topic === 'orders/updated') {
      const [existingTransaction, products] = await Promise.all([
        TransactionModel.findOne({
          'platformMetadata.orderId': orderId,
          'platformMetadata.platform': 'shopify'
        }),
        ProductModel.find({
          'platformMetadata.platform': 'shopify',
          'platformMetadata.productId': { 
            $in: body.line_items.map(item => item.product_id.toString()) 
          }
        }).lean()
      ])

      const productMap = new Map(products.map(p => [p.platformMetadata.productId, p]))
      const processingFee = Number(body.total_price) * 0.029 + 0.30
      const taxAmount = Number(body.total_tax) || 0

      const transaction = {
        source: 'shopify',
        type: 'sale',
        amount: body.total_price,
        processingFee,
        taxAmount,
        platformMetadata: {
          platform: 'shopify',
          orderId: orderId,
          data: body
        },
        lineItems: body.line_items.map(item => {
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

      if (existingTransaction) {
        await TransactionModel.findByIdAndUpdate(existingTransaction._id, transaction)
      } else {
        await TransactionModel.create(transaction)
      }
    }

    // Mark webhook as completed
    await db.collection('webhook_processing').updateOne(
      { webhookId },
      { $set: { status: 'completed', updatedAt: new Date() } }
    )
  } catch (error) {
    console.error('Error processing webhook:', error)
    // Mark webhook as failed
    const { db } = await connectToDatabase()
    await db.collection('webhook_processing').updateOne(
      { webhookId },
      { 
        $set: { 
          status: 'failed', 
          error: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date()
        }
      }
    )
  }
}

export async function POST(request: Request) {
  try {
    const webhookId = request.headers.get('x-shopify-webhook-id')
    const topic = request.headers.get('x-shopify-topic')
    
    if (!webhookId || !topic) {
      return NextResponse.json({ error: 'Missing webhook ID or topic' }, { status: 400 })
    }

    const { isValid, body: rawBody } = await verifyShopifyWebhook(request)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody) as ShopifyWebhookBody
    const orderId = body.id.toString()

    // Start processing in the background without waiting
    processWebhookData(webhookId, topic, orderId, body).catch(console.error)

    // Respond immediately after validation
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Shopify webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 