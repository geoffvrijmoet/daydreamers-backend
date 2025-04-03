import { NextResponse } from 'next/server'

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
  _id: string
  name: string
  category: string
  platformMetadata: {
    platform: string
    productId: string
  }
}

interface MongoResponse<T> {
  document?: T
  documents?: T[]
  error?: string
}

interface MongoFilter {
  [key: string]: unknown
}

interface MongoUpdate {
  $set: Record<string, unknown>
}

// Use edge runtime with 60s timeout (Hobby plan limit)
export const runtime = 'node'
export const maxDuration = 60

// MongoDB Data API configuration
const MONGODB_API_KEY = process.env.MONGODB_API_KEY
const MONGODB_CLUSTER = process.env.MONGODB_CLUSTER
const MONGODB_DATABASE = process.env.MONGODB_DATABASE
const MONGODB_DATA_API_URL = `https://data.mongodb-api.com/app/data-${MONGODB_CLUSTER}/endpoint/data/v1`

// MongoDB Data API helper functions
async function mongoFindOne<T>(collection: string, filter: MongoFilter): Promise<MongoResponse<T>> {
  const response = await fetch(`${MONGODB_DATA_API_URL}/action/findOne`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': MONGODB_API_KEY!,
    },
    body: JSON.stringify({
      collection,
      database: MONGODB_DATABASE,
      dataSource: 'Cluster0',
      filter,
    }),
  })
  return response.json()
}

async function mongoFind<T>(collection: string, filter: MongoFilter): Promise<MongoResponse<T>> {
  const response = await fetch(`${MONGODB_DATA_API_URL}/action/find`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': MONGODB_API_KEY!,
    },
    body: JSON.stringify({
      collection,
      database: MONGODB_DATABASE,
      dataSource: 'Cluster0',
      filter,
    }),
  })
  return response.json()
}

async function mongoInsertOne<T>(collection: string, document: T): Promise<MongoResponse<T>> {
  const response = await fetch(`${MONGODB_DATA_API_URL}/action/insertOne`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': MONGODB_API_KEY!,
    },
    body: JSON.stringify({
      collection,
      database: MONGODB_DATABASE,
      dataSource: 'Cluster0',
      document,
    }),
  })
  return response.json()
}

async function mongoUpdateOne<T>(collection: string, filter: MongoFilter, update: MongoUpdate): Promise<MongoResponse<T>> {
  const response = await fetch(`${MONGODB_DATA_API_URL}/action/updateOne`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': MONGODB_API_KEY!,
    },
    body: JSON.stringify({
      collection,
      database: MONGODB_DATABASE,
      dataSource: 'Cluster0',
      filter,
      update,
    }),
  })
  return response.json()
}

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

    // First, check if we've already processed this webhook
    const existingWebhook = await mongoFindOne<{ status: string }>('webhook_processing', { webhookId })
    if (existingWebhook?.document) {
      return NextResponse.json({ 
        success: true, 
        message: 'Webhook already processed',
        status: existingWebhook.document.status 
      })
    }

    // Create webhook processing record
    const now = new Date()
    await mongoInsertOne('webhook_processing', {
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
      const [existingTransaction, productsResult] = await Promise.all([
        mongoFindOne<{ _id: string }>('transactions', {
          'platformMetadata.orderId': orderId,
          'platformMetadata.platform': 'shopify'
        }),
        mongoFind<Product>('products', {
          'platformMetadata.platform': 'shopify',
          'platformMetadata.productId': { 
            $in: body.line_items.map(item => item.product_id.toString()) 
          }
        })
      ])

      const products = productsResult?.documents || []
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
      if (existingTransaction?.document) {
        await mongoUpdateOne(
          'transactions',
          { _id: existingTransaction.document._id },
          { $set: transaction }
        )
      } else {
        await mongoInsertOne('transactions', transaction)
      }
    }

    // Mark webhook as completed
    await mongoUpdateOne(
      'webhook_processing',
      { webhookId },
      { $set: { status: 'completed', updatedAt: new Date() } }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Shopify webhook error:', error)
    
    // Try to mark webhook as failed if we have the ID
    if (webhookId) {
      try {
        await mongoUpdateOne(
          'webhook_processing',
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