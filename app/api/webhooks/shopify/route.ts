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

// Explicitly set runtime to nodejs
export const runtime = 'nodejs'
export const maxDuration = 60 // 1 minute timeout

// Direct MongoDB connection for webhooks - no pooling
async function connectToMongoDBDirect() {
  const uri = process.env.MONGODB_URI
  const dbName = process.env.MONGODB_DB
  
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not defined')
  }
  
  if (!dbName) {
    throw new Error('MONGODB_DB environment variable is not defined')
  }
  
  console.log('Creating direct MongoDB connection...')
  const client = new MongoClient(uri, {
    connectTimeoutMS: 10000, // 10 seconds
    socketTimeoutMS: 45000,  // 45 seconds
  })
  
  await client.connect()
  console.log('Direct MongoDB connection established')
  
  return { client, db: client.db(dbName) }
}

// Helper function to mask MongoDB URI for logging
function maskMongoURI(uri: string): string {
  try {
    // Extract just enough information for debugging without exposing credentials
    const urlObj = new URL(uri);
    const host = urlObj.host;
    const protocol = urlObj.protocol;
    const dbName = urlObj.pathname.substring(1); // Remove leading slash
    
    // Mask the username and password
    const hasCredentials = urlObj.username.length > 0;
    
    return `${protocol}//${hasCredentials ? '***:***@' : ''}${host}/${dbName.length > 0 ? dbName : '(no database specified)'}`;
  } catch (error) {
    console.error('Error parsing MongoDB URI:', error);
    return 'Invalid MongoDB URI format';
  }
}

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

// Process webhook data
async function processWebhookData(webhookId: string, topic: string, orderId: string, body: ShopifyWebhookBody) {
  // Log MongoDB URI preview before connecting
  if (process.env.MONGODB_URI) {
    console.log('MongoDB URI preview:', maskMongoURI(process.env.MONGODB_URI));
  } else {
    console.error('MONGODB_URI environment variable is not defined!');
  }
  
  console.log('Connecting to database...');
  let client = null;
  try {
    const { client: mongoClient, db } = await connectToMongoDBDirect();
    client = mongoClient;
    console.log('Connected to database successfully!');
    
    console.log('Processing webhook data...')
    
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
      console.log('Processing order:', orderId)
      
      // Use the direct db connection for these operations
      const existingTransaction = await db.collection('transactions').findOne({
        'platformMetadata.orderId': orderId,
        'platformMetadata.platform': 'shopify'
      });
      
      const products = await db.collection('products').find({
        'platformMetadata.platform': 'shopify',
        'platformMetadata.productId': { 
          $in: body.line_items.map(item => item.product_id.toString()) 
        }
      }).toArray();

      console.log(`Found ${products.length} products`)
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

      console.log('Saving transaction...')
      if (existingTransaction) {
        await db.collection('transactions').updateOne(
          { _id: existingTransaction._id },
          { $set: transaction }
        );
        console.log('Updated existing transaction')
      } else {
        await db.collection('transactions').insertOne(transaction);
        console.log('Created new transaction')
      }
    }

    // Mark webhook as completed
    console.log('Marking webhook as completed')
    await db.collection('webhook_processing').updateOne(
      { webhookId },
      { $set: { status: 'completed', updatedAt: new Date() } }
    )
    console.log('Webhook processing completed')
  } catch (error) {
    console.error('Error in processWebhookData:', error)
    throw error
  } finally {
    if (client) {
      console.log('Closing MongoDB connection')
      await client.close(true)
      console.log('MongoDB connection closed')
    }
  }
}

export async function POST(request: Request) {
  let webhookId: string | null = null
  let topic: string | null = null
  let orderId: string | null = null
  let mongoClient = null
  
  try {
    webhookId = request.headers.get('x-shopify-webhook-id')
    topic = request.headers.get('x-shopify-topic')
    
    if (!webhookId || !topic) {
      return NextResponse.json({ error: 'Missing webhook ID or topic' }, { status: 400 })
    }

    const { isValid, body: rawBody } = await verifyShopifyWebhook(request)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody) as ShopifyWebhookBody
    orderId = body.id.toString()

    // Verify MongoDB connection BEFORE returning success
    // This ensures we only return 200 if we can actually connect
    try {
      // Log MongoDB URI preview before connecting
      if (process.env.MONGODB_URI) {
        console.log('MongoDB URI preview:', maskMongoURI(process.env.MONGODB_URI));
      } else {
        console.error('MONGODB_URI environment variable is not defined!');
        return NextResponse.json({ error: 'MongoDB URI not configured' }, { status: 500 })
      }
      
      console.log('Connecting to database for connection test...');
      const { client } = await connectToMongoDBDirect();
      mongoClient = client;
      console.log('MongoDB connection test successful');
      
      // NOW we can return a success response
      // Close this test connection since we'll create a new one for the actual processing
      await client.close(true);
      console.log('Test connection closed, returning 200 success');
    } catch (connectionError) {
      console.error('MongoDB connection test failed:', connectionError);
      return NextResponse.json(
        { error: 'Failed to connect to database', details: connectionError instanceof Error ? connectionError.message : 'Unknown error' }, 
        { status: 503 }
      );
    }

    // Only now do we return success and process in the background
    const response = NextResponse.json({ success: true })

    // Process webhook after sending response
    processWebhookData(webhookId, topic, orderId, body)
      .then(() => {
        console.log('Webhook processing completed successfully')
      })
      .catch(async (error) => {
        console.error('Error processing webhook:', error)
        try {
          // Log MongoDB URI preview before connecting
          if (process.env.MONGODB_URI) {
            console.log('MongoDB URI preview (error handler):', maskMongoURI(process.env.MONGODB_URI));
          }
          
          console.log('Connecting to database for error handling...');
          const { client, db } = await connectToMongoDBDirect();
          console.log('Connected to database successfully in error handler!');
          
          try {
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
          } finally {
            await client.close(true)
            console.log('MongoDB connection closed in error handler')
          }
        } catch (dbError) {
          console.error('Error updating webhook status:', dbError)
        }
      })

    return response
  } catch (error) {
    console.error('Shopify webhook error:', error)
    // Try to mark webhook as failed if we have the ID
    if (webhookId) {
      try {
        // Log MongoDB URI preview before connecting
        if (process.env.MONGODB_URI) {
          console.log('MongoDB URI preview (main error handler):', maskMongoURI(process.env.MONGODB_URI));
        }
        
        console.log('Connecting to database (main error handler)...');
        const { client, db } = await connectToMongoDBDirect();
        console.log('Connected to database successfully in main error handler!');
        
        try {
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
        } finally {
          await client.close(true)
          console.log('MongoDB connection closed in main error handler')
        }
      } catch (dbError) {
        console.error('Error updating webhook status:', dbError)
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    if (mongoClient) {
      try {
        await mongoClient.close(true)
        console.log('Cleaned up test MongoDB connection')
      } catch (err) {
        console.error('Error closing MongoDB client:', err)
      }
    }
  }
} 