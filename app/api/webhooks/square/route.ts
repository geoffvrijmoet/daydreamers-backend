import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import crypto from 'crypto'

// Function to verify Square webhook signature
function verifySquareSignature(signatureHeader: string, body: string) {
  if (!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
    console.error('SQUARE_WEBHOOK_SIGNATURE_KEY not configured')
    return false
  }

  try {
    const hmac = crypto.createHmac('sha256', process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)
    const generatedSignature = hmac.update(body).digest('base64')
    return signatureHeader === generatedSignature
  } catch (error) {
    console.error('Error verifying Square signature:', error)
    return false
  }
}

export async function POST(request: Request) {
  try {
    // Get the raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get('x-square-hmacsha256-signature')

    if (!signature) {
      console.error('No Square signature header found')
      return NextResponse.json({ error: 'Missing signature header' }, { status: 401 })
    }

    if (!verifySquareSignature(signature, rawBody)) {
      console.error('Invalid Square webhook signature')
      console.error('Received signature:', signature)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody)

    // Handle different event types
    const eventType = body.type
    console.log('Received Square webhook:', { eventType, body })

    if (eventType === 'order.created' || eventType === 'order.updated') {
      await connectToDatabase()

      // Get the order ID from the event
      const orderId = body.data?.object?.order_id
      if (!orderId) {
        throw new Error('No order ID in webhook payload')
      }

      // Fetch full order details from Square
      const { result } = await squareClient.ordersApi.retrieveOrder(orderId)
      const order = result.order
      if (!order) {
        throw new Error('Order not found in Square')
      }

      // Check if transaction already exists
      const existing = await mongoose.model('Transaction').findOne({
        'platformMetadata.platform': 'square',
        'platformMetadata.orderId': order.id
      })

      // Determine transaction status
      let status: 'completed' | 'cancelled' | 'refunded' = 'completed'
      if (order.state === 'CANCELED') {
        status = 'cancelled'
      }

      // Get refund information if needed
      let refundInfo
      if (status !== 'cancelled') {
        const { result: refundResult } = await squareClient.ordersApi.searchOrders({
          locationIds: [process.env.SQUARE_LOCATION_ID!],
          query: {
            filter: {
              dateTimeFilter: {
                createdAt: {
                  startAt: order.createdAt,
                  endAt: order.createdAt
                }
              }
            }
          }
        })

        const refundedOrder = refundResult.orders?.find(o => 
          o.id === order.id && o.refunds && o.refunds.length > 0
        )

        if (refundedOrder?.refunds?.[0]) {
          status = 'refunded'
          refundInfo = {
            amount: Number(refundedOrder.refunds[0].amountMoney!.amount),
            date: refundedOrder.refunds[0].createdAt
          }
        }
      }

      // Calculate tax amounts
      const TAX_RATE = 0.08875
      const totalAmount = order.totalMoney?.amount ? Number(order.totalMoney.amount) / 100 : 0
      const tipAmount = order.tenders?.[0]?.tipMoney?.amount 
        ? Number(order.tenders[0].tipMoney.amount) / 100 
        : 0
      
      // Subtotal includes tax but not tip
      const subtotal = totalAmount - tipAmount
      // Work backwards to find pre-tax amount and round to 2 decimal places
      const preTaxAmount = Number((subtotal / (1 + TAX_RATE)).toFixed(2))
      const calculatedTax = Number((subtotal - preTaxAmount).toFixed(2))

      // Calculate Square processing fee (2.6% + $0.15)
      const processingFee = Number((totalAmount * 0.026 + 0.15).toFixed(2))

      const transaction = {
        type: 'sale' as const,
        date: order.createdAt,
        amount: totalAmount,
        preTaxAmount,
        taxAmount: calculatedTax,
        tip: tipAmount,
        status,
        source: 'square' as const,
        customer: order.customerId ? `square_${order.customerId}` : undefined,
        refundAmount: refundInfo?.amount,
        refundDate: refundInfo?.date,
        updatedAt: order.updatedAt,
        isTaxable: true,
        paymentProcessing: {
          fee: processingFee,
          provider: 'Square',
          transactionId: order.id
        },
        platformMetadata: {
          platform: 'square' as const,
          orderId: order.id,
          data: {
            orderId: order.id,
            locationId: order.locationId || process.env.SQUARE_LOCATION_ID!,
            state: order.state as 'OPEN' | 'COMPLETED' | 'CANCELED',
            createdAt: order.createdAt,
            updatedAt: order.updatedAt
          }
        },
        products: await Promise.all(order.lineItems?.map(async item => {
          // Try to find the MongoDB product using Square's catalog ID
          const product = item.catalogObjectId ? 
            await mongoose.model('Product').findOne({
              'platformMetadata.platform': 'square',
              'platformMetadata.productId': item.catalogObjectId
            }) : null

          // Determine the product name with fallback logic
          let productName = item.name;
          
          // If no name, try to get it from the catalog object
          if (!productName && item.catalogObjectId) {
            try {
              const { result } = await squareClient.catalogApi.retrieveCatalogObject(item.catalogObjectId);
              if (result.object && result.object.type === 'ITEM_VARIATION' && result.object.itemVariationData) {
                // Get the parent item to get the base name
                const parentId = result.object.itemVariationData.itemId;
                if (parentId) {
                  const { result: parentResult } = await squareClient.catalogApi.retrieveCatalogObject(parentId);
                  if (parentResult.object && parentResult.object.itemData) {
                    const baseName = parentResult.object.itemData.name;
                    const variationName = result.object.itemVariationData.name;
                    productName = variationName ? `${baseName} - ${variationName}` : baseName;
                  }
                }
              }
            } catch (catalogError) {
              console.warn(`[Square Webhook] Failed to fetch catalog object ${item.catalogObjectId}:`, catalogError);
            }
          }

          // Final fallback options
          if (!productName) {
            productName = (product?.name) || 
                         `Square Item ${item.catalogObjectId || 'Unknown'}`;
          }

          console.log(`[Square Webhook] Product name resolution:`, {
            originalName: item.name,
            catalogObjectId: item.catalogObjectId,
            finalName: productName,
            foundProduct: !!product
          });

          return {
            name: productName,
            quantity: Number(item.quantity),
            unitPrice: Number(item.basePriceMoney?.amount || 0) / 100,
            totalPrice: Number(item.totalMoney?.amount || 0) / 100,
            isTaxable: true,
            productId: product?._id || new mongoose.Types.ObjectId()
          }
        }) || [])
      }

      if (existing) {
        // Update existing transaction
        const updated = await mongoose.model('Transaction').findOneAndUpdate(
          { _id: existing._id },
          { $set: transaction },
          { new: true }
        )
        console.log('Updated transaction from webhook:', updated._id)
        return NextResponse.json({ message: 'Transaction updated', id: updated._id })
      }

      // Create new transaction
      const newTransaction = await mongoose.model('Transaction').create({
        ...transaction,
        createdAt: new Date().toISOString()
      })

      console.log('Created transaction from webhook:', newTransaction._id)
      return NextResponse.json({ message: 'Transaction created', id: newTransaction._id })
    }

    // Acknowledge other event types
    return NextResponse.json({ message: 'Event received' })

  } catch (error) {
    console.error('Error processing Square webhook:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed' },
      { status: 500 }
    )
  }
} 