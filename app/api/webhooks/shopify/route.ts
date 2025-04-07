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
    
    // Create webhook processing record
    const now = new Date()
    console.log(`[processWebhookData] Creating webhook_processing record for ${webhookId}`);
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
    console.log(`[processWebhookData] Created webhook_processing record`);

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
      { webhookId },
      { $set: { status: 'completed', updatedAt: new Date() } }
    );
    console.log(`[processWebhookData] Webhook processing completed`);
  } catch (error) {
    console.error(`[processWebhookData] Error in processWebhookData:`, error);
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
  let mongoClient = null
  
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

    // Process webhook after sending response - make sure this executes
    console.log('Starting asynchronous webhook processing...');
    
    // Use setTimeout to make sure this runs asynchronously
    setTimeout(() => {
      console.log(`Beginning async processing of webhook ${webhookId || 'unknown'} for order ${orderId || 'unknown'}`);
      processWebhookData(webhookId!, topic!, orderId!, body)
        .then(() => {
          console.log(`Webhook processing completed successfully for order ${orderId || 'unknown'}`)
        })
        .catch(async (error) => {
          console.error(`Error processing webhook for order ${orderId || 'unknown'}:`, error)
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
              console.log(`Updated webhook_processing record to failed status for webhook ${webhookId}`);
            } finally {
              await client.close(true)
              console.log('MongoDB connection closed in error handler')
            }
          } catch (dbError) {
            console.error('Error updating webhook status:', dbError)
          }
        });
    }, 10); // tiny delay to ensure response is sent first

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