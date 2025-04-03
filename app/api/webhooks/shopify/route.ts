import { NextResponse } from 'next/server'
import { MongoClient, ObjectId } from 'mongodb'

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

interface Product {
  _id: ObjectId
  name: string
  category: string
  platformMetadata: {
    platform: string
    productId: string
  }
}

// Use edge runtime with 60s timeout (Hobby plan limit)
export const runtime = 'edge'
export const maxDuration = 60

// Verify Shopify webhook signature using Web Crypto API
async function verifyShopifyWebhook(request: Request): Promise<{ isValid: boolean; body: string }> {
  const hmac = request.headers.get('x-shopify-hmac-sha256')
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET

  if (!hmac || !secret) {
    return { isValid: false, body: '' }
  }

  try {
    const clonedRequest = request.clone()
    const bodyBuffer = await clonedRequest.arrayBuffer()
    const rawBody = new TextDecoder().decode(bodyBuffer)

    // Convert secret to Uint8Array
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    // Sign the body
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      bodyBuffer
    )

    // Convert signature to base64 using array spread for compatibility
    const signatureArray = Array.from(new Uint8Array(signature))
    const calculatedHmac = btoa(String.fromCharCode.apply(null, signatureArray))

    return { isValid: hmac === calculatedHmac, body: rawBody }
  } catch (error) {
    console.error('Error verifying Shopify webhook:', error)
    return { isValid: false, body: '' }
  }
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

    // Connect to MongoDB using Edge-compatible configuration
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('Missing MONGODB_URI')

    client = new MongoClient(uri)
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
      const [existingTransaction, rawProducts] = await Promise.all([
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

      // Type assertion for products after validation
      const products = rawProducts.filter((p): p is Product => 
        p !== null && 
        typeof p === 'object' && 
        '_id' in p && 
        p._id instanceof ObjectId &&
        'name' in p && 
        'category' in p && 
        'platformMetadata' in p &&
        typeof p.platformMetadata === 'object' &&
        p.platformMetadata !== null &&
        'platform' in p.platformMetadata &&
        'productId' in p.platformMetadata
      )

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
            productId: product?._id.toString(), // Convert ObjectId to string
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
  }
} 