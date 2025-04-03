import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import TransactionModel from '@/lib/models/transaction'
import ProductModel from '@/lib/models/Product'
import WebhookProcessingModel from '@/lib/models/webhook-processing'
import crypto from 'crypto'
import { IWebhookProcessing } from '@/lib/models/webhook-processing'
import mongoose from 'mongoose'

// Explicitly set runtime to nodejs
export const runtime = 'nodejs'

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

// Helper function to ensure database connection
async function ensureConnection() {
  await connectToDatabase()
  
  // Wait for actual connection to be ready
  if (mongoose.connection.readyState !== 1) {
    console.log('Waiting for connection to be ready...')
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Database connection timeout'))
      }, 5000) // 5 second timeout

      mongoose.connection.once('connected', () => {
        clearTimeout(timeout)
        console.log('Connection is now ready')
        resolve()
      })
    })
  }
  
  return mongoose.connection.db
}

export async function POST(request: Request) {
  let body: ShopifyOrder | undefined
  let topic: string | null = null
  let webhookId: string | null = null
  let webhookProcessing: IWebhookProcessing | null = null
  
  try {
    console.log('Starting Shopify webhook processing...')
    
    // Get webhook ID and topic early
    webhookId = request.headers.get('x-shopify-webhook-id')
    topic = request.headers.get('x-shopify-topic')
    
    if (!webhookId || !topic) {
      console.log('Missing webhook ID or topic')
      return NextResponse.json({ error: 'Missing webhook ID or topic' }, { status: 400 })
    }

    // Start signature verification and database connection in parallel
    console.log('Starting parallel operations...')
    const [db, verificationResult] = await Promise.all([
      ensureConnection(),
      verifyShopifyWebhook(request)
    ])
    console.log('Initial parallel operations completed')

    if (!db) {
      throw new Error('Database connection failed')
    }

    const { isValid, body: rawBody } = verificationResult

    if (!isValid) {
      console.log('Invalid webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    body = JSON.parse(rawBody) as ShopifyOrder
    const orderId = body.id.toString()
    console.log(`Processing webhook for order ${orderId} with topic ${topic} and webhook ID ${webhookId}`)

    // Try to create a new processing record using native MongoDB operation
    console.log('Attempting to create webhook processing record...')
    try {
      const collection = db.collection('webhook_processing')
      const now = new Date()
      const result = await collection.insertOne({
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
      webhookProcessing = { _id: result.insertedId } as IWebhookProcessing
      console.log(`Created new webhook processing record: ${webhookProcessing._id}`)
    } catch (err) {
      // Check if error is a MongoDB duplicate key error
      if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
        console.log('Webhook already processed or processing')
        return NextResponse.json({ 
          success: true,
          message: 'Webhook already processed or processing'
        })
      }
      console.error('Error creating webhook processing record:', err)
      throw err
    }

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
          if (webhookProcessing) {
            await WebhookProcessingModel.findByIdAndUpdate(webhookProcessing._id, {
              status: 'completed'
            })
            console.log(`Webhook processing record ${webhookProcessing._id} marked as completed`)
          }
        }).catch(async (error) => {
          console.error('Error saving transaction:', error)
          // Update webhook processing status to failed
          if (webhookProcessing) {
            await WebhookProcessingModel.findByIdAndUpdate(webhookProcessing._id, {
              status: 'failed',
              error: error.message
            })
            console.log(`Webhook processing record ${webhookProcessing._id} marked as failed`)
          }
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
        if (webhookProcessing) {
          await WebhookProcessingModel.findByIdAndUpdate(webhookProcessing._id, {
            status: 'completed'
          })
        }
        return NextResponse.json({ message: 'Unhandled webhook topic' })
    }
  } catch (error) {
    console.error('Shopify webhook error:', error)
    // If we have a webhook processing record, mark it as failed
    if (error instanceof Error && webhookId) {
      console.log(`Marking webhook ${webhookId} as failed`)
      await WebhookProcessingModel.findOneAndUpdate(
        { webhookId },
        {
          status: 'failed',
          error: error.message
        }
      )
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 