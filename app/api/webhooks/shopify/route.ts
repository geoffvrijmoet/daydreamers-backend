import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { MongoClient } from 'mongodb'

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

// Use edge runtime with 60s timeout (Hobby plan limit)
export const runtime = 'edge'
export const maxDuration = 60

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

// Get MongoDB client
async function getMongoClient() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('Missing MONGODB_URI')
  
  const client = new MongoClient(uri, {
    maxPoolSize: 1,
    minPoolSize: 0,
    maxIdleTimeMS: 10000,
    connectTimeoutMS: 5000
  })

  await client.connect()
  return client
}

export async function POST(request: Request) {
  let client: MongoClient | null = null
  let webhookId: string | null = null
  let topic: string | null = null
  
  try {
    webhookId = request.headers.get('x-shopify-webhook-id')
    topic = request.headers.get('x-shopify-topic')
    
    if (!webhookId || !topic) {
      return NextResponse.json({ error: 'Missing webhook ID or topic' }, { status: 400 })
    }

    // Verify webhook signature
    const { isValid, body: rawBody } = await verifyShopifyWebhook(request)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody) as ShopifyWebhookBody
    const orderId = body.id.toString()

    // Connect to MongoDB
    client = await getMongoClient()
    const db = client.db()

    // First, check if we've already processed this webhook
    const existingWebhook = await db.collection('webhook_processing').findOne({ webhookId })
    if (existingWebhook) {
      return NextResponse.json({ 
        success: true, 
        message: 'Webhook already processed',
        status: existingWebhook.status 
      })
    }

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
      // Get existing transaction and products in parallel
      const [existingTransaction, products] = await Promise.all([
        db.collection('transactions').findOne({
          'platformMetadata.orderId': orderId,
          'platformMetadata.platform': 'shopify'
        }),
        db.collection('products').find({
          'platformMetadata.platform': 'shopify',
          'platformMetadata.productId': { 
            $in: body.line_items.map(item => item.product_id.toString()) 
          }
        }).toArray()
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

      // Save transaction
      if (existingTransaction) {
        await db.collection('transactions').updateOne(
          { _id: existingTransaction._id },
          { $set: transaction }
        )
      } else {
        await db.collection('transactions').insertOne(transaction)
      }
    }

    // Mark webhook as completed
    await db.collection('webhook_processing').updateOne(
      { webhookId },
      { $set: { status: 'completed', updatedAt: new Date() } }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Shopify webhook error:', error)
    
    // Try to mark webhook as failed if we have the ID
    if (webhookId && client) {
      try {
        await client.db().collection('webhook_processing').updateOne(
          { webhookId },
          { 
            $set: { 
              status: 'failed', 
              error: error instanceof Error ? error.message : 'Unknown error',
              updatedAt: new Date()
            }
          }
        )
      } catch (dbError) {
        console.error('Error updating webhook status:', dbError)
      }
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    if (client) {
      await client.close()
    }
  }
} 