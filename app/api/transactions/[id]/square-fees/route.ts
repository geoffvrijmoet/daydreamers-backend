import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { squareClient } from '@/lib/square'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.log('[API] Square fees request received:', {
    transactionId: params.id,
    method: request.method,
    url: request.url
  });

  try {
    await connectToDatabase()
    
    // Get the transaction
    console.log('[API] Finding transaction in MongoDB...');
    const transaction = await mongoose.connection.db!.collection('transactions').findOne({ 
      _id: new mongoose.Types.ObjectId(params.id),
      source: 'square'
    })

    console.log('[API] Transaction lookup result:', {
      found: !!transaction,
      id: transaction?._id,
      source: transaction?.source,
      amount: transaction?.amount
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found or not a Square transaction' },
        { status: 404 }
      )
    }

    // Get Square order ID from platformMetadata or try to extract from id field
    const squareOrderId = transaction.platformMetadata?.orderId || 
      (transaction.id && transaction.id.startsWith('square_') ? transaction.id.replace('square_', '') : null);

    console.log('[API] Extracted Square order ID:', {
      squareOrderId,
      hasPlatformMetadata: !!transaction.platformMetadata?.orderId,
      extractedFromId: transaction.id && transaction.id.startsWith('square_')
    });

    if (!squareOrderId) {
      return NextResponse.json(
        { error: 'No Square order ID found for this transaction' },
        { status: 400 }
      )
    }

    // First, fetch the order to get the payment ID
    console.log('[API] Fetching order details from Square...');
    const { result: orderResult } = await squareClient.ordersApi.retrieveOrder(squareOrderId)
    const order = orderResult.order

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found in Square' },
        { status: 404 }
      )
    }

    console.log('[API] Square order details:', {
      orderId: order.id,
      totalAmount: order.totalMoney?.amount,
      tendersCount: order.tenders?.length || 0,
      tenders: order.tenders?.map(t => ({
        type: t.type,
        paymentId: t.paymentId,
        cardDetails: t.cardDetails ? 'present' : 'none'
      }))
    });

    // Extract payment ID from the first tender
    let paymentId: string | null = null;
    if (order.tenders && order.tenders.length > 0) {
      // Find the first tender with a payment ID
      for (const tender of order.tenders) {
        if (tender.paymentId) {
          paymentId = tender.paymentId;
          break;
        }
      }
    }

    console.log('[API] Extracted payment ID from order:', {
      paymentId,
      foundInTenders: !!paymentId
    });

    let processingFee = 0;

    if (paymentId) {
      try {
        // Fetch the actual payment details to get the processing fee
        console.log('[API] Fetching payment details from Square...');
        const { result: paymentResult } = await squareClient.paymentsApi.getPayment(paymentId)
        const payment = paymentResult.payment

        if (payment) {
          console.log('[API] Square payment details:', {
            paymentId: payment.id,
            status: payment.status,
            totalAmount: payment.totalMoney?.amount,
            processingFeesCount: payment.processingFee?.length || 0,
            processingFees: payment.processingFee?.map(fee => ({
              type: fee.type,
              effectiveAt: fee.effectiveAt,
              amountMoney: fee.amountMoney
            }))
          });

          // Extract processing fee from payment.processingFee
          if (payment.processingFee && payment.processingFee.length > 0) {
            for (const fee of payment.processingFee) {
              if (fee.amountMoney?.amount) {
                processingFee += Number(fee.amountMoney.amount) / 100; // Convert from cents
              }
            }
            
            if (processingFee > 0) {
              console.log(`[Fee Calculation] Using actual fee from Square Payment API: $${processingFee.toFixed(2)}`);
            }
          }
        }
      } catch (paymentError) {
        console.warn('[API] Failed to fetch payment details:', paymentError);
      }
    }

    // If we still don't have a processing fee, calculate an estimate
    if (processingFee === 0) {
      const totalAmount = Number(order.totalMoney?.amount || 0) / 100;
      processingFee = Number(((totalAmount * 0.026) + 0.10).toFixed(2));
      console.log(`[Fee Calculation] No Square fee data found, calculating estimate: $${processingFee.toFixed(2)}`);
    }
    
    console.log('[API] Final processing fee:', {
      processingFee,
      source: processingFee > 0 && paymentId ? 'Square Payments API' : 'Calculated estimate'
    });

    // Update the transaction with the calculated fee in paymentProcessing field
    console.log('[API] Updating transaction in MongoDB...');
    const result = await mongoose.connection.db!.collection('transactions').findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(params.id) },
      { 
        $set: { 
          paymentProcessing: {
            fee: processingFee,
            provider: 'Square',
            transactionId: transaction.id || transaction._id.toString(),
            paymentId: paymentId || undefined
          },
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

  } catch (error) {
    console.error('[API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to calculate Square fees' },
      { status: 500 }
    )
  }
} 