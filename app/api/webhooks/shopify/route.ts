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
  
  console.log(`[processWebhookData] Starting processing for webhook ${webhookId}, order ${orderId}`);
  console.log('Connecting to database...');
  let client = null;
  try {
    const { client: mongoClient, db } = await connectToMongoDBDirect();
    client = mongoClient;
    console.log('Connected to database successfully!');
    
    console.log(`[processWebhookData] Processing webhook data for ${topic}...`);
    
    // Create or update webhook processing record
    const now = new Date()
    console.log(`[processWebhookData] Upserting webhook_processing record for ${webhookId}`);
    
    const webhookFilter = {
      platform: 'shopify',
      orderId,
      topic
    };
    
    const webhookUpdate = {
      $set: {
        webhookId,
        status: 'processing',
        data: body,
        updatedAt: now,
        lastAttempt: now
      },
      $setOnInsert: {
        createdAt: now
      },
      $inc: {
        attemptCount: 1
      }
    };
    
    await db.collection('webhook_processing').updateOne(
      webhookFilter,
      webhookUpdate,
      { upsert: true }
    );
    console.log(`[processWebhookData] Upserted webhook_processing record`);

    // Process order data
    if (topic === 'orders/create' || topic === 'orders/updated') {
      console.log(`[processWebhookData] Processing order: ${orderId}`);
      
      // Use the direct db connection for these operations
      console.log(`[processWebhookData] Looking for existing transaction with orderId: ${orderId}`);
      const existingTransaction = await db.collection('transactions').findOne({
        'platformMetadata.orderId': orderId,
        'platformMetadata.platform': 'shopify'
      });
      
      if (existingTransaction) {
        console.log(`[processWebhookData] Found existing transaction with _id: ${existingTransaction._id}`);
      } else {
        console.log(`[processWebhookData] No existing transaction found, will create new`);
      }
      
      console.log(`[processWebhookData] Looking for products for line items`);
      const productIds = body.line_items.map(item => item.product_id.toString());
      console.log(`[processWebhookData] Product IDs to look for: ${productIds.join(', ')}`);
      
      const products = await db.collection('products').find({
        'platformMetadata.platform': 'shopify',
        'platformMetadata.productId': { 
          $in: productIds
        }
      }).toArray();

      console.log(`[processWebhookData] Found ${products.length} products out of ${productIds.length} product IDs`);
      
      if (products.length < productIds.length) {
        console.log(`[processWebhookData] Missing products: ${productIds.filter(id => 
          !products.some(p => p.platformMetadata.productId === id)
        ).join(', ')}`);
      }
      
      const productMap = new Map(products.map(p => [p.platformMetadata.productId, p]));
      const processingFee = Number(body.total_price) * 0.029 + 0.30;
      const taxAmount = Number(body.total_tax) || 0;

      console.log(`[processWebhookData] Preparing transaction object with amount: ${body.total_price}, tax: ${taxAmount}`);

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
          const product = productMap.get(item.product_id.toString());
          const lineItem = {
            productId: product?._id,
            name: item.title,
            quantity: item.quantity,
            price: item.price,
            sku: item.sku,
            variantId: item.variant_id?.toString(),
            productName: product?.name || item.title,
            category: product?.category || 'Uncategorized'
          };
          console.log(`[processWebhookData] Line item: ${lineItem.quantity}x ${lineItem.name} (${lineItem.sku}), product ID: ${lineItem.productId || 'not mapped'}`);
          return lineItem;
        }),
        updatedAt: new Date() // Explicitly set updatedAt field
      }

      console.log(`[processWebhookData] Saving transaction...`);
      if (existingTransaction) {
        console.log(`[processWebhookData] Updating existing transaction ${existingTransaction._id}`);
        const updateResult = await db.collection('transactions').updateOne(
          { _id: existingTransaction._id },
          { 
            $set: transaction,
            $currentDate: { updatedAt: true } // Ensure updatedAt is set to the current date
          }
        );
        console.log(`[processWebhookData] Updated existing transaction. ModifiedCount: ${updateResult.modifiedCount}`);
      } else {
        // Include createdAt for new transactions
        const newTransaction = {
          ...transaction,
          createdAt: new Date()
        };
        console.log(`[processWebhookData] Inserting new transaction`);
        const insertResult = await db.collection('transactions').insertOne(newTransaction);
        console.log(`[processWebhookData] Created new transaction with _id: ${insertResult.insertedId}`);
      }
    }

    // Mark webhook as completed
    console.log(`[processWebhookData] Marking webhook ${webhookId} as completed`);
    await db.collection('webhook_processing').updateOne(
      webhookFilter,
      { 
        $set: { 
          status: 'completed', 
          updatedAt: new Date(),
          completedAt: new Date()
        }
      }
    );
    console.log(`[processWebhookData] Webhook processing completed`);
  } catch (error) {
    console.error(`[processWebhookData] Error in processWebhookData:`, error);
    
    // Try to mark the webhook as failed if we have a connection
    if (client) {
      try {
        await client.db().collection('webhook_processing').updateOne(
          {
            platform: 'shopify',
            orderId,
            topic
          },
          {
            $set: {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
              updatedAt: new Date()
            }
          }
        );
      } catch (updateError) {
        console.error('[processWebhookData] Failed to update webhook status to failed:', updateError);
      }
    }
    
    throw error;
  } finally {
    if (client) {
      console.log(`[processWebhookData] Closing MongoDB connection`);
      await client.close(true);
      console.log(`[processWebhookData] MongoDB connection closed`);
    }
  }
}

export async function POST(request: Request) {
  let webhookId: string | null = null
  let topic: string | null = null
  let orderId: string | null = null
  
  try {
    webhookId = request.headers.get('x-shopify-webhook-id')
    topic = request.headers.get('x-shopify-topic')
    
    if (!webhookId || !topic) {
      return NextResponse.json({ error: 'Missing webhook ID or topic' }, { status: 400 })
    }

    console.log(`Processing webhook ID: ${webhookId}, topic: ${topic}`);
    
    const { isValid, body: rawBody } = await verifyShopifyWebhook(request)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody) as ShopifyWebhookBody
    orderId = body.id.toString()
    console.log(`Verified Shopify webhook for order ID: ${orderId}`);

    // Process the webhook data before sending response
    try {
      console.log('Processing webhook data synchronously...');
      await processWebhookData(webhookId, topic, orderId, body);
      console.log('Webhook processing completed successfully');
      
      return NextResponse.json({ success: true });
    } catch (processingError) {
      console.error('Error processing webhook:', processingError);
      
      // If we have a connection error, return 503
      if (processingError instanceof Error && 
          (processingError.message.includes('connect') || 
           processingError.message.includes('timeout'))) {
        return NextResponse.json(
          { 
            error: 'Database connection failed', 
            details: processingError.message 
          }, 
          { status: 503 }
        );
      }
      
      // For other errors, return 500
      return NextResponse.json(
        { 
          error: 'Webhook processing failed', 
          details: processingError instanceof Error ? processingError.message : 'Unknown error'
        }, 
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Shopify webhook error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
} 