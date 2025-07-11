import { NextResponse } from 'next/server'
import { shopifyClient } from '@/lib/shopify'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

interface StripePaymentIntent {
  id: string;
  object: string;
  amount: number;
  charges?: {
    object: string;
    data: StripeCharge[];
    has_more: boolean;
    total_count: number;
    url: string;
  };
  [key: string]: unknown;
}

interface StripeCharge {
  id: string;
  object: string;
  amount: number;
  balance_transaction?: {
    id: string;
    fee: number;
    fee_details?: Array<{
      amount: number;
      currency: string;
      description: string;
      type: string;
    }>;
  };
  outcome?: {
    network_status: string;
    reason: string;
    risk_level: string;
    risk_score: number;
    seller_message: string;
    type: string;
  };
  [key: string]: unknown;
}

// Type guard functions
function hasProperty<T extends object, K extends string>(
  obj: T,
  prop: K
): obj is T & Record<K, unknown> {
  return prop in obj;
}

function isShopifyTransaction(obj: unknown): obj is {
  kind: string;
  status: string;
  amount: string;
  fee?: number;
  gateway: string;
  receipt?: StripePaymentIntent;
  payment_details?: unknown;
  processed_at: string;
} {
  return typeof obj === 'object' && obj !== null && 
         hasProperty(obj, 'kind') && 
         hasProperty(obj, 'status') && 
         hasProperty(obj, 'amount');
}

// GraphQL response interfaces
interface GraphQLTransactionFee {
  id: string;
  amount: {
    amount: string;
    currencyCode: string;
  };
  flatFee: {
    amount: string;
    currencyCode: string;
  };
  rate: string;
  type: string;
  rateName?: string;
  flatFeeName?: string;
  taxAmount: {
    amount: string;
    currencyCode: string;
  };
}

interface GraphQLTransaction {
  id: string;
  kind: string;
  status: string;
  gateway: string;
  amount: string;
  fees: GraphQLTransactionFee[];
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

  // Declare processingFee once at the top
  let processingFee = 0;

  try {
    await connectToDatabase()
    
    // Get the transaction using direct MongoDB access (same as Square fees route)
    console.log('[API] Finding transaction in MongoDB...');
    const transaction = await mongoose.connection.db!.collection('transactions').findOne({ 
      _id: new mongoose.Types.ObjectId(params.id),
      source: 'shopify'
    })

    console.log('[API] Transaction lookup result:', {
      found: !!transaction,
      id: transaction?._id,
      source: transaction?.source,
      transactionId: transaction?.id,
      shopifyOrderId: transaction?.shopifyOrderId
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found or not a Shopify transaction' },
        { status: 404 }
      )
    }

    // Get Shopify order ID from either shopifyOrderId field or extract from id field
    const shopifyOrderId = transaction.shopifyOrderId || 
      (transaction.id && transaction.id.startsWith('shopify_') ? transaction.id.replace('shopify_', '') : null);

    console.log('[API] Extracted Shopify order ID:', {
      shopifyOrderId,
      hasShopifyOrderId: !!transaction.shopifyOrderId,
      extractedFromId: transaction.id && transaction.id.startsWith('shopify_'),
      originalId: transaction.id
    });

    if (!shopifyOrderId) {
      return NextResponse.json(
        { error: 'No Shopify order ID found for this transaction' },
        { status: 400 }
      )
    }

    // Try to get actual fees using GraphQL Admin API first
    console.log('[API] Attempting to fetch actual fees via GraphQL...');
    
    try {
      const graphqlQuery = `
        query getOrderTransactionFees($orderId: ID!) {
          order(id: $orderId) {
            id
            name
            transactions {
              id
              kind
              status
              gateway
              amount
              fees {
                id
                amount {
                  amount
                  currencyCode
                }
                flatFee {
                  amount
                  currencyCode
                }
                rate
                type
                rateName
                flatFeeName
                taxAmount {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      `;
      
      const variables = {
        orderId: `gid://shopify/Order/${shopifyOrderId}`
      };
      
      console.log('[API] GraphQL query variables:', variables);
      
      // Make GraphQL request to Shopify Admin API
      const graphqlResponse = await fetch(`https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2025-07/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN || ''
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables
        })
      });
      
      if (graphqlResponse.ok) {
        const graphqlData = await graphqlResponse.json();
        console.log('[API] GraphQL response:', JSON.stringify(graphqlData, null, 2));
        
        if (graphqlData.data?.order?.transactions) {
          // Find capture transaction with fees
          const captureTransaction = graphqlData.data.order.transactions.find(
            (t: GraphQLTransaction) => t.kind === 'CAPTURE' && t.status === 'SUCCESS' && t.fees?.length > 0
          );
          
          if (captureTransaction?.fees) {
            console.log('[API] Found transaction fees via GraphQL:', captureTransaction.fees);
            
            // Sum up all processing fees
            let totalFees = 0;
            for (const fee of captureTransaction.fees) {
              if (fee.type === 'payment_processing' || fee.type?.toLowerCase().includes('processing')) {
                totalFees += parseFloat(fee.amount.amount);
              }
            }
            
            if (totalFees > 0) {
              processingFee = totalFees;
              console.log(`[Fee Calculation] Using actual fees from Shopify GraphQL: $${processingFee.toFixed(2)}`);
            }
          }
        }
      } else {
        console.warn('[API] GraphQL request failed:', graphqlResponse.status, await graphqlResponse.text());
      }
    } catch (graphqlError) {
      console.warn('[API] GraphQL fee lookup failed:', graphqlError);
    }

    // If GraphQL didn't provide fees, fall back to REST API parsing
    if (processingFee === 0) {
      console.log('[API] No fees found via GraphQL, falling back to REST API parsing...');
    } else {
      // Skip REST API processing if we got fees from GraphQL
      console.log('[API] Successfully got fees from GraphQL, updating transaction...');
      
      const result = await mongoose.connection.db!.collection('transactions').findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(params.id) },
        { 
          $set: { 
            paymentProcessing: {
              fee: processingFee,
              provider: 'Shopify',
              transactionId: shopifyOrderId,
              source: 'GraphQL Admin API'
            },
            updatedAt: new Date().toISOString()
          } 
        },
        { returnDocument: 'after' }
      );

      return NextResponse.json({
        success: true,
        processingFee,
        transaction: result
      });
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
      totalTax: order.total_tax,
      // Check for fee-related fields in order
      financialStatus: order.financial_status,
      gateway: order.gateway,
      processingMethod: order.processing_method,
      // Look for any fee-related fields
      orderFeeFields: Object.keys(order).filter(key => 
        key.toLowerCase().includes('fee') || 
        key.toLowerCase().includes('cost') || 
        key.toLowerCase().includes('charge')
      ),
      // Examine the additional fees fields
      currentAdditionalFees: hasProperty(order, 'current_total_additional_fees_set') 
        ? order.current_total_additional_fees_set : 'not found',
      originalAdditionalFees: hasProperty(order, 'original_total_additional_fees_set')
        ? order.original_total_additional_fees_set : 'not found'
    });

    // Get transaction fees from Shopify
    console.log('[API] Fetching transactions from Shopify...');
    const transactions = await shopifyClient.transaction.list(shopifyOrderId);
    
    // Log the complete first transaction to see all available fields
    console.log('[API] First transaction full data:', transactions[0]);
    
    // Check for fee-related fields in all transactions
    console.log('[API] Fee-related field analysis:', {
      allTransactionKeys: transactions.length > 0 ? Object.keys(transactions[0]) : [],
      feeRelatedFields: transactions.map((t: unknown, index: number) => {
        if (typeof t === 'object' && t !== null) {
          const feeFields = Object.keys(t).filter(key => 
            key.toLowerCase().includes('fee') || 
            key.toLowerCase().includes('cost') || 
            key.toLowerCase().includes('charge') ||
            key.toLowerCase().includes('rate') ||
            key.toLowerCase().includes('discount')
          );
          return {
            transactionIndex: index,
            kind: isShopifyTransaction(t) ? t.kind : 'unknown',
            feeFields: feeFields,
            additionalFields: Object.keys(t).filter(key => 
              !['id', 'order_id', 'kind', 'gateway', 'status', 'message', 'created_at', 'processed_at', 'amount', 'currency'].includes(key)
            )
          };
        }
        return { transactionIndex: index, kind: 'invalid', feeFields: [], additionalFields: [] };
      })
    });
    
    console.log('[API] Found Shopify transactions:', {
      count: transactions.length,
      types: transactions.map((t: unknown) => isShopifyTransaction(t) ? t.kind : 'unknown'),
      transactions: transactions.map((t: unknown) => {
        if (isShopifyTransaction(t)) {
          return {
            kind: t.kind,
            status: t.status,
            amount: t.amount,
            fee: t.fee,
            gateway: t.gateway,
            receipt: t.receipt,
            payment_details: t.payment_details,
            processed_at: t.processed_at
          };
        }
        return { kind: 'unknown', status: 'unknown', amount: '0' };
      })
    });

    // Find the successful capture transaction
    const paymentTransaction = transactions.find((t: unknown) => 
      isShopifyTransaction(t) && t.status === 'success' && t.kind === 'capture'
    );
    
    if (paymentTransaction && isShopifyTransaction(paymentTransaction)) {
      console.log('[API] Analyzing capture transaction for fee data...');
      console.log('[API] Capture transaction details:', {
        id: paymentTransaction.id || 'unknown',
        kind: paymentTransaction.kind,
        amount: paymentTransaction.amount,
        gateway: paymentTransaction.gateway,
        receiptKeys: paymentTransaction.receipt && typeof paymentTransaction.receipt === 'object' 
          ? Object.keys(paymentTransaction.receipt) : [],
        hasReceipt: !!paymentTransaction.receipt
      });
      
      // Try to get the fee from the transaction
      if (paymentTransaction.fee) {
        processingFee = Number(paymentTransaction.fee);
        console.log(`[Fee Calculation] Using actual fee from Shopify: $${processingFee.toFixed(2)}`);
      } else if (paymentTransaction.receipt && typeof paymentTransaction.receipt === 'object') {
        // Try to extract fee from payment gateway receipt data
        const receipt = paymentTransaction.receipt;
        console.log('[API] Examining payment receipt data for fee information...');
        
        // Check payment method to determine how to extract fee
        let paymentMethod = 'unknown';
        if (hasProperty(paymentTransaction, 'payment_details') && 
            paymentTransaction.payment_details && 
            typeof paymentTransaction.payment_details === 'object' &&
            hasProperty(paymentTransaction.payment_details, 'payment_method_name') &&
            typeof paymentTransaction.payment_details.payment_method_name === 'string') {
          paymentMethod = paymentTransaction.payment_details.payment_method_name;
        }
        
        console.log('[API] Payment method detected:', paymentMethod);
        
        // Check receipt structure first to determine the actual processing method
        // Some transactions show payment_method_name as 'visa' but use PayPal processing infrastructure
        const hasPayPalStructure = hasProperty(receipt, 'seller_receivable_breakdown') && 
                                   receipt.seller_receivable_breakdown &&
                                   typeof receipt.seller_receivable_breakdown === 'object';
        
        const hasStripeStructure = hasProperty(receipt, 'charges') && 
                                   receipt.charges &&
                                   typeof receipt.charges === 'object' &&
                                   hasProperty(receipt.charges, 'data') &&
                                   Array.isArray(receipt.charges.data);
        
        console.log('[API] Receipt structure analysis:', {
          paymentMethod,
          hasPayPalStructure,
          hasStripeStructure,
          receiptType: hasPayPalStructure ? 'PayPal' : hasStripeStructure ? 'Stripe' : 'Unknown'
        });
        
        // Check for PayPal fee structure (regardless of payment_method_name)
        if (hasPayPalStructure) {
          
          console.log('[API] PayPal transaction detected. Seller breakdown:', receipt.seller_receivable_breakdown);
          
          const breakdown = receipt.seller_receivable_breakdown;
          
          // Check for paypal_fee (ensure breakdown is typed as object)
          if (breakdown &&
              typeof breakdown === 'object' &&
              hasProperty(breakdown, 'paypal_fee') && 
              breakdown.paypal_fee &&
              typeof breakdown.paypal_fee === 'object' &&
              hasProperty(breakdown.paypal_fee, 'value') &&
              typeof breakdown.paypal_fee.value === 'string') {
            
            processingFee = Number(breakdown.paypal_fee.value);
            console.log(`[Fee Calculation] Using actual PayPal fee: $${processingFee.toFixed(2)}`);
            
          } else if (breakdown &&
                     typeof breakdown === 'object' &&
                     hasProperty(breakdown, 'platform_fees') && 
                     Array.isArray(breakdown.platform_fees)) {
            
            // Sometimes fees are in platform_fees array
            let totalFees = 0;
            for (const fee of breakdown.platform_fees) {
              if (fee && 
                  typeof fee === 'object' && 
                  hasProperty(fee, 'amount') &&
                  fee.amount &&
                  typeof fee.amount === 'object' &&
                  hasProperty(fee.amount, 'value') &&
                  typeof fee.amount.value === 'string') {
                totalFees += Number(fee.amount.value);
              }
            }
            
            if (totalFees > 0) {
              processingFee = totalFees;
              console.log(`[Fee Calculation] Using PayPal platform fees: $${processingFee.toFixed(2)}`);
            }
          }
          
        } else if (hasStripeStructure && receipt.charges) {
            
            // Credit card via Stripe - extract fee from Stripe charge data
            console.log('[API] Credit card transaction detected. Examining Stripe data...');
            const charges = receipt.charges.data;
            
            console.log('[API] Detailed charges data:', {
              chargesLength: charges.length,
              firstChargeStructure: charges.length > 0 ? {
                keys: Object.keys(charges[0] || {}),
                id: hasProperty(charges[0], 'id') ? charges[0].id : 'missing',
                amount: hasProperty(charges[0], 'amount') ? charges[0].amount : 'missing',
                hasBalanceTransaction: hasProperty(charges[0], 'balance_transaction'),
                balanceTransactionType: charges[0] && hasProperty(charges[0], 'balance_transaction') 
                  ? typeof charges[0].balance_transaction : 'none',
                balanceTransactionValue: charges[0] && hasProperty(charges[0], 'balance_transaction') 
                  ? charges[0].balance_transaction : 'none'
              } : 'no charges'
            });
            
            if (charges.length > 0) {
              const charge = charges[0];
              if (charge && 
                  typeof charge === 'object' && 
                  hasProperty(charge, 'balance_transaction') &&
                  charge.balance_transaction &&
                  typeof charge.balance_transaction === 'object' &&
                  hasProperty(charge.balance_transaction, 'fee') &&
                  typeof charge.balance_transaction.fee === 'number') {
                
                console.log('[API] Found Stripe charge with balance_transaction:', {
                  balanceTransaction: charge.balance_transaction,
                  chargeId: hasProperty(charge, 'id') ? charge.id : 'unknown',
                  amount: hasProperty(charge, 'amount') ? charge.amount : 'unknown',
                  fee: charge.balance_transaction.fee
                });
                
                processingFee = Number(charge.balance_transaction.fee) / 100; // Convert from cents
                console.log(`[Fee Calculation] Using actual fee from Stripe charge: $${processingFee.toFixed(2)}`);
              } else {
                console.log('[API] Charge structure analysis:', {
                  chargeExists: !!charge,
                  chargeType: typeof charge,
                  hasBalanceTransaction: charge && hasProperty(charge, 'balance_transaction'),
                  balanceTransactionExists: charge && charge.balance_transaction,
                  balanceTransactionType: charge && charge.balance_transaction ? typeof charge.balance_transaction : 'none',
                  balanceTransactionStructure: charge && charge.balance_transaction && typeof charge.balance_transaction === 'object' 
                    ? Object.keys(charge.balance_transaction) : 'none'
                });
              }
            }
        }
        
        // If we still don't have a fee, log the receipt structure to understand what's available
        if (processingFee === 0) {
          console.log('[API] No fee found in payment receipt. Receipt structure:', {
            paymentMethod,
            hasCharges: hasProperty(receipt, 'charges'),
            hasSellerBreakdown: hasProperty(receipt, 'seller_receivable_breakdown'),
            receiptKeys: Object.keys(receipt),
            sellerBreakdownKeys: hasProperty(receipt, 'seller_receivable_breakdown') && 
                                 receipt.seller_receivable_breakdown &&
                                 typeof receipt.seller_receivable_breakdown === 'object' 
                                 ? Object.keys(receipt.seller_receivable_breakdown) : []
          });
        }
      }
      
      // If we still don't have a processing fee, calculate an estimate
      if (processingFee === 0) {
        console.log('[API] No processing fee found in transaction data. Exploring alternatives...');
        console.log('[API] Potential alternative approaches:', {
          note: 'Shopify may not expose actual processing fees through Transaction API',
          alternatives: [
            'Shopify Admin GraphQL API - financial object queries',
            'Shopify Payouts API - settlement/payout data',
            'Shopify Financial API - dedicated fee endpoints',
            'Third-party accounting integrations'
          ],
          currentFallback: 'Using standard rate calculation (2.9% + $0.30)'
        });
        
        // Before calculating an estimate, check if there are processing fees in the order's additional_fees_set
        console.log('[API] Checking order additional fees for processing fee...');
        
        if (hasProperty(order, 'current_total_additional_fees_set') && 
            order.current_total_additional_fees_set &&
            typeof order.current_total_additional_fees_set === 'object') {
          
          const additionalFees = order.current_total_additional_fees_set;
          console.log('[API] Current additional fees structure:', additionalFees);
          
          // Check shop_money for fee amount (most likely location)
          if (hasProperty(additionalFees, 'shop_money') &&
              additionalFees.shop_money &&
              typeof additionalFees.shop_money === 'object' &&
              hasProperty(additionalFees.shop_money, 'amount')) {
            
            const feeAmount = Number(additionalFees.shop_money.amount);
            if (feeAmount > 0) {
              processingFee = feeAmount;
              console.log(`[Fee Calculation] Using actual fee from Shopify additional fees: $${processingFee.toFixed(2)}`);
            }
          }
          
          // If not in shop_money, check presentment_money
          if (processingFee === 0 &&
              hasProperty(additionalFees, 'presentment_money') &&
              additionalFees.presentment_money &&
              typeof additionalFees.presentment_money === 'object' &&
              hasProperty(additionalFees.presentment_money, 'amount')) {
            
            const feeAmount = Number(additionalFees.presentment_money.amount);
            if (feeAmount > 0) {
              processingFee = feeAmount;
              console.log(`[Fee Calculation] Using actual fee from Shopify additional fees (presentment): $${processingFee.toFixed(2)}`);
            }
          }
        }
        
        // If still no fee found, use an improved calculation based on transaction details
        if (processingFee === 0) {
          // Get payment details for more accurate estimation
          const cardCompany = hasProperty(paymentTransaction, 'payment_details') && 
                             paymentTransaction.payment_details &&
                             typeof paymentTransaction.payment_details === 'object' &&
                             hasProperty(paymentTransaction.payment_details, 'credit_card_company')
                             ? paymentTransaction.payment_details.credit_card_company
                             : 'unknown';
          
          const cardWallet = hasProperty(paymentTransaction, 'payment_details') && 
                            paymentTransaction.payment_details &&
                            typeof paymentTransaction.payment_details === 'object' &&
                            hasProperty(paymentTransaction.payment_details, 'credit_card_wallet')
                            ? paymentTransaction.payment_details.credit_card_wallet
                            : null;
          
          // Shopify Payments standard rates (as of 2024)
          let percentageFee = 0.029; // 2.9% base rate
          const flatFee = 0.30; // $0.30 base fee
          
          // Adjust based on card type
          if (typeof cardCompany === 'string') {
            switch (cardCompany.toLowerCase()) {
              case 'american express':
              case 'amex':
                percentageFee = 0.035; // 3.5% for Amex
                break;
              case 'visa':
              case 'mastercard':
              case 'discover':
                percentageFee = 0.029; // 2.9% for major cards
                break;
              default:
                percentageFee = 0.029; // Default rate
            }
          }
          
          // Shopify Pay might have slightly different rates
          if (cardWallet === 'shopify_pay') {
            // Shopify Pay typically has the same rates but better fraud protection
            // Keep the same rate but note it in logs
          }
          
          // Calculate final fee
          const calculatedPercentageFee = totalAmount * percentageFee;
          processingFee = calculatedPercentageFee + flatFee;
          
          console.log(`[Fee Calculation] Enhanced fee estimate:
  Card Company: ${cardCompany}
  Card Wallet: ${cardWallet || 'none'}
  Total Amount: $${totalAmount.toFixed(2)}
  Percentage Rate: ${(percentageFee * 100).toFixed(1)}%
  Percentage Fee: $${calculatedPercentageFee.toFixed(2)}
  Flat Fee: $${flatFee.toFixed(2)}
  Total Estimated Fee: $${processingFee.toFixed(2)}
  Note: Actual fees may vary based on merchant agreement`);
        }
      }
      
      console.log(`[API] Processing fees calculation:`, {
        totalAmount,
        fee: paymentTransaction.fee,
        calculatedFee: processingFee,
        transactionType: paymentTransaction.kind,
        gateway: paymentTransaction.gateway
      });

      // Update the transaction with the new fee in paymentProcessing structure using direct MongoDB access
      console.log('[API] Updating transaction in MongoDB...');
      const result = await mongoose.connection.db!.collection('transactions').findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(params.id) },
        { 
          $set: { 
            paymentProcessing: {
              fee: processingFee,
              provider: 'Shopify',
              transactionId: shopifyOrderId
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