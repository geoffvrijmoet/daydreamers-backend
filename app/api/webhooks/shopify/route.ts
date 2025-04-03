import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import TransactionModel from '@/lib/models/transaction'
import ProductModel from '@/lib/models/Product'
import WebhookProcessingModel, { IWebhookProcessing } from '@/lib/models/webhook-processing'
import crypto from 'crypto'
import { MongoClient, Db } from 'mongodb'
import mongoose from 'mongoose'

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

// Generate a unique webhook ID
function generateWebhookId(request: Request): string {
  const hmac = request.headers.get('x-shopify-hmac-sha256')
  const topic = request.headers.get('x-shopify-topic')
  const timestamp = Date.now()
  return crypto.createHash('sha256').update(`${hmac}-${topic}-${timestamp}`).digest('hex')
}

export async function POST(request: Request) {
  let dbConnection: Promise<{ client: MongoClient; db: Db }> | undefined
  let webhookProcessing: IWebhookProcessing | null = null

  try {
    // Start DB connection early but don't await it yet
    dbConnection = connectToDatabase()

    // Verify webhook signature and get body
    const { isValid, body: rawBody } = await verifyShopifyWebhook(request)

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const webhookId = generateWebhookId(request)
    const topic = request.headers.get('x-shopify-topic')

    if (!topic) {
      return NextResponse.json({ error: 'Missing topic' }, { status: 400 })
    }

    // Now wait for DB connection
    await dbConnection

    // Check if we've already processed this webhook
    webhookProcessing = await WebhookProcessingModel.findOne({ webhookId })

    if (webhookProcessing?.status === 'completed') {
      return NextResponse.json({ message: 'Webhook already processed' })
    }

    // If no existing record, create one
    if (!webhookProcessing) {
      webhookProcessing = await WebhookProcessingModel.create({
        webhookId,
        platform: 'shopify',
        topic,
        rawBody,
        status: 'processing',
        attemptCount: 1,
        lastAttempt: new Date()
      })
    } else {
      // Update existing record
      webhookProcessing.attemptCount += 1
      webhookProcessing.lastAttempt = new Date()
      webhookProcessing.status = 'processing'
      await webhookProcessing.save()
    }

    const body = JSON.parse(rawBody) as ShopifyOrder

    switch (topic) {
      case 'orders/create':
      case 'orders/updated': {
        const order = body
        const orderId = order.id.toString()

        // Start these queries in parallel
        const [existingTransaction, lineItems] = await Promise.all([
          // Check if transaction exists
          TransactionModel.findOne({
            'platformMetadata.orderId': orderId,
            'platformMetadata.platform': 'shopify'
          }).lean() as Promise<{ _id: mongoose.Types.ObjectId } | null>,
          // Look up all products in parallel
          Promise.all(
            order.line_items.map(async (item: ShopifyLineItem) => {
              const product = await ProductModel.findOne({
                'platformMetadata.platform': 'shopify',
                'platformMetadata.productId': item.product_id.toString()
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
        ])

        // Save progress
        if (webhookProcessing) {
          webhookProcessing.processedData = {
            orderId,
            existingTransaction: existingTransaction?._id,
            lineItems
          }
          await webhookProcessing.save()
        }

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

        const transaction = {
          date: new Date(order.created_at),
          customerName: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || 'Anonymous',
          description: `Shopify Order #${order.name}`,
          products: lineItems,
          amount: Number(order.total_price),
          taxAmount,
          processingFees,
          type: 'sale',
          source: 'shopify',
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
          console.log(existingTransaction ? 'Updated' : 'Created', 'Shopify transaction:', orderId)
          // Update webhook processing status
          if (webhookProcessing) {
            webhookProcessing.status = 'completed'
            await webhookProcessing.save()
          }
        }).catch(async (error: unknown) => {
          console.error('Error saving transaction:', error)
          // Update webhook processing status
          if (webhookProcessing) {
            webhookProcessing.status = 'failed'
            webhookProcessing.error = error instanceof Error ? error.message : 'Unknown error occurred'
            await webhookProcessing.save()
          }
        })

        // Return success immediately
        return NextResponse.json({ 
          success: true,
          message: `${existingTransaction ? 'Updating' : 'Creating'} transaction ${orderId}`
        })
      }

      default:
        return NextResponse.json({ message: 'Unhandled webhook topic' })
    }
  } catch (error) {
    console.error('Shopify webhook error:', error)
    
    // If we have a webhook processing record, update its status
    if (webhookProcessing) {
      webhookProcessing.status = 'failed'
      webhookProcessing.error = error instanceof Error ? error.message : 'Unknown error occurred'
      await webhookProcessing.save()
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 