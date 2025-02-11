import { NextResponse } from 'next/server'
import { shopifyClient } from '@/lib/shopify'
import { getDb } from '@/lib/db'
import { ObjectId } from 'mongodb'

interface ShopifyTransaction {
  status: string;
  kind: string;
  amount: string;
  fee?: number;
  gateway: string;
  processed_at: string;
  receipt?: unknown;
  payment_details?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.log('[API] Shopify fees request received:', {
    transactionId: params.id,
    method: request.method,
    url: request.url
  });

  try {
    const db = await getDb()
    
    // Get the transaction
    console.log('[API] Finding transaction in MongoDB...');
    const transaction = await db.collection('transactions').findOne({ 
      _id: new ObjectId(params.id),
      source: 'shopify'
    })

    console.log('[API] Transaction lookup result:', {
      found: !!transaction,
      id: transaction?._id,
      source: transaction?.source,
      internalId: transaction?.id
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found or not a Shopify transaction' },
        { status: 404 }
      )
    }

    // Get Shopify order ID from either shopifyOrderId field or extract from id field
    const shopifyOrderId = transaction.shopifyOrderId || 
      (transaction.id.startsWith('shopify_') ? transaction.id.replace('shopify_', '') : null);

    console.log('[API] Extracted Shopify order ID:', {
      shopifyOrderId,
      hasShopifyOrderId: !!transaction.shopifyOrderId,
      extractedFromId: transaction.id.startsWith('shopify_')
    });

    if (!shopifyOrderId) {
      return NextResponse.json(
        { error: 'No Shopify order ID found for this transaction' },
        { status: 400 }
      )
    }

    // First get the order details to get the total amount including shipping
    console.log('[API] Fetching order details from Shopify...');
    const order = await shopifyClient.order.get(shopifyOrderId);
    const totalAmount = Number(order.total_price);
    console.log('[API] Order details:', {
      orderId: order.id,
      totalPrice: order.total_price,
      subtotalPrice: order.subtotal_price,
      totalShipping: order.total_shipping_price_set?.shop_money?.amount,
      totalTax: order.total_tax
    });

    // Get transaction fees from Shopify
    console.log('[API] Fetching transactions from Shopify...');
    let processingFee = 0;
    const transactions = await shopifyClient.transaction.list(shopifyOrderId) as ShopifyTransaction[];
    
    // Log the complete first transaction to see all available fields
    console.log('[API] First transaction full data:', transactions[0]);
    
    console.log('[API] Found Shopify transactions:', {
      count: transactions.length,
      types: transactions.map(t => t.kind),
      transactions: transactions.map(t => ({
        kind: t.kind,
        status: t.status,
        amount: t.amount,
        fee: t.fee,
        gateway: t.gateway,
        receipt: t.receipt,
        payment_details: t.payment_details,
        processed_at: t.processed_at
      }))
    });

    // Find the successful capture transaction
    const paymentTransaction = transactions.find(t => 
      t.status === 'success' && 
      t.kind === 'capture'
    );
    
    if (paymentTransaction) {
      // Try to get the fee from the transaction
      if (paymentTransaction.fee) {
        processingFee = Number(paymentTransaction.fee);
        console.log(`[Fee Calculation] Using actual fee from Shopify: $${processingFee.toFixed(2)}`);
      } else {
        // If no fee field, use a default calculation (2.9% + $0.30)
        // Use the total amount including shipping for fee calculation
        const percentageFee = totalAmount * 0.029;
        const flatFee = 0.30;
        processingFee = percentageFee + flatFee;
        
        console.log(`[Fee Calculation] Calculating credit card fee:
  Total Amount (including shipping): $${totalAmount.toFixed(2)}
  Percentage Fee (2.9%): $${percentageFee.toFixed(2)}
  Flat Fee: $${flatFee.toFixed(2)}
  Total Fee: $${processingFee.toFixed(2)}`);
      }
      
      console.log(`[API] Processing fees calculation:`, {
        totalAmount,
        fee: paymentTransaction.fee,
        calculatedFee: processingFee,
        transactionType: paymentTransaction.kind,
        gateway: paymentTransaction.gateway
      });

      // Update the transaction with the new fee
      console.log('[API] Updating transaction in MongoDB...');
      const result = await db.collection('transactions').findOneAndUpdate(
        { _id: new ObjectId(params.id) },
        { 
          $set: { 
            shopifyProcessingFee: processingFee,
            updatedAt: new Date().toISOString()
          } 
        },
        { returnDocument: 'after' }
      )

      if (!result) {
        console.error('[API] Failed to update transaction in MongoDB');
        return NextResponse.json(
          { error: 'Failed to update transaction' },
          { status: 500 }
        )
      }

      console.log('[API] Successfully updated transaction');
      return NextResponse.json({
        success: true,
        processingFee,
        transaction: result
      })
    }

    console.log('[API] No payment transaction found');
    return NextResponse.json(
      { error: 'No payment transaction found' },
      { status: 404 }
    )

  } catch (error) {
    console.error('[API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Shopify fees' },
      { status: 500 }
    )
  }
} 