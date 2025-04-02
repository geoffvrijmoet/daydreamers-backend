import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import mongoose from 'mongoose'
import TransactionModel from '@/lib/models/transaction'
import { IProduct } from '@/lib/models/Product'
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

// Helper function to get raw body as a string
async function getRawBody(request: Request): Promise<string> {
  const reader = request.body?.getReader()
  if (!reader) {
    throw new Error('No request body')
  }

  const chunks: Uint8Array[] = []
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8')
}

// Verify Shopify webhook signature
function verifyShopifyWebhook(rawBody: string, hmac: string | null): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  if (!hmac || !secret) {
    console.error('Missing HMAC or webhook secret', { 
      hmacPresent: !!hmac, 
      secretPresent: !!secret,
      secretLength: secret?.length
    })
    return false
  }

  try {
    // Generate the HMAC exactly as Shopify expects
    const calculatedHmac = crypto
      .createHmac('sha256', secret)
      .update(Buffer.from(rawBody, 'utf8'))
      .digest('base64')

    const isValid = hmac === calculatedHmac

    console.log('Shopify webhook verification:', {
      provided: hmac,
      calculated: calculatedHmac,
      bodyLength: rawBody.length,
      isValid,
      // Log first few characters of the body for debugging
      bodyPreview: rawBody.substring(0, 100) + '...',
      // Log the secret preview for verification
      secretPreview: `${secret.substring(0, 4)}...`
    })
    
    return isValid
  } catch (error) {
    console.error('Error verifying Shopify webhook:', error)
    return false
  }
}

export async function POST(request: Request) {
  try {
    const hmac = request.headers.get('x-shopify-hmac-sha256')
    
    console.log('Received Shopify webhook:', {
      hmacPresent: !!hmac,
      contentLength: request.headers.get('content-length'),
      topic: request.headers.get('x-shopify-topic'),
      orderId: request.headers.get('x-shopify-order-id')
    })

    // Get the raw body using the stream reader
    const rawBody = await getRawBody(request.clone())

    // Verify webhook signature
    if (!verifyShopifyWebhook(rawBody, hmac)) {
      console.error('Invalid Shopify webhook signature', {
        hmacPresent: !!hmac,
        secretPresent: !!process.env.SHOPIFY_WEBHOOK_SECRET,
        secretKeyPreview: process.env.SHOPIFY_WEBHOOK_SECRET ? 
          `${process.env.SHOPIFY_WEBHOOK_SECRET.substring(0, 4)}...` : 'not set',
        headers: Object.fromEntries(request.headers)
      })
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody) as ShopifyOrder

    // Handle different event types
    const topic = request.headers.get('x-shopify-topic')
    if (!topic) {
      return NextResponse.json({ error: 'Missing topic' }, { status: 400 })
    }

    // Connect to database
    await connectToDatabase()

    switch (topic) {
      case 'orders/create':
      case 'orders/updated': {
        const order = body
        const orderId = order.id.toString()

        // Check if transaction already exists
        const existingTransaction = await TransactionModel.findOne({
          'platformMetadata.orderId': orderId,
          'platformMetadata.platform': 'shopify'
        })

        // Determine transaction status
        let status: 'completed' | 'cancelled' | 'refunded' = 'completed'
        if (order.cancelled_at) {
          status = 'cancelled'
        } else if (order.refunds && order.refunds.length > 0) {
          status = 'refunded'
        }

        // Calculate tax amount
        const taxAmount = Number(order.total_tax || 0)

        // Calculate processing fees
        const processingFees = order.transactions
          ?.filter((t: ShopifyTransaction) => t.status === 'success')
          .reduce((sum: number, t: ShopifyTransaction) => sum + Number(t.receipt?.processing_fee || 0), 0) || 0

        // Look up products
        const lineItems = await Promise.all(
          order.line_items.map(async (item: ShopifyLineItem) => {
            const product = await mongoose.model<IProduct>('Product').findOne({
              'platformMetadata.shopifyId': item.product_id.toString()
            })
            return {
              productId: product?._id,
              name: item.title,
              quantity: item.quantity,
              price: Number(item.price),
              sku: item.sku,
              variantId: item.variant_id?.toString()
            }
          })
        )

        const transaction = {
          date: new Date(order.created_at),
          customerName: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || 'Anonymous',
          description: `Shopify Order #${order.name}`,
          products: lineItems,
          amount: Number(order.total_price),
          taxAmount,
          processingFees,
          platformMetadata: {
            platform: 'shopify' as const,
            orderId,
            orderNumber: order.name,
            status: order.financial_status,
            refunds: order.refunds?.map((refund: ShopifyRefund) => ({
              id: refund.id,
              amount: Number(refund.transactions[0]?.amount || 0),
              reason: refund.note || 'No reason provided'
            }))
          },
          status
        }

        if (existingTransaction) {
          // Update existing transaction
          await TransactionModel.findByIdAndUpdate(existingTransaction._id, transaction)
          console.log('Updated Shopify transaction:', orderId)
        } else {
          // Create new transaction
          await TransactionModel.create(transaction)
          console.log('Created new Shopify transaction:', orderId)
        }

        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ message: 'Unhandled webhook topic' })
    }
  } catch (error) {
    console.error('Shopify webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 