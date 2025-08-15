import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import type { Order } from 'square'
import SyncStateModel from '@/lib/models/SyncState'
import ProductModel from '@/lib/models/Product'
import { updateInventoryForNewTransaction } from '@/lib/utils/inventory-management'
import { mergeDuplicateTransactions } from '@/lib/utils/transaction-merge'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { startDate, endDate } = body
    
    await connectToDatabase()
    console.log('Starting Square transactions sync...')

    // Get last sync timestamp if no dates provided
    const syncState = await SyncStateModel.findOne({ source: 'square' })
    const lastSyncTime = startDate || syncState?.lastSuccessfulSync || '2023-01-01T00:00:00Z'
    const now = endDate || new Date().toISOString()

    console.log('Sync time range:', { start: lastSyncTime, end: now })

    // Get orders from Square since last sync
    const { result } = await squareClient.ordersApi.searchOrders({
      locationIds: [process.env.SQUARE_LOCATION_ID!],
      query: {
        filter: {
          dateTimeFilter: {
            createdAt: {
              startAt: lastSyncTime,
              endAt: now
            }
          },
          stateFilter: {
            states: ['OPEN', 'COMPLETED', 'CANCELED'] // Include cancelled orders
          }
        },
        sort: {
          sortField: 'CREATED_AT',
          sortOrder: 'ASC'
        }
      }
    })

    const orders = result.orders || []
    console.log(`Found ${orders.length} Square orders since ${lastSyncTime}`)

    // Get refunded orders for this time period
    const { result: refundResult } = await squareClient.ordersApi.searchOrders({
      locationIds: [process.env.SQUARE_LOCATION_ID!],
      query: {
        filter: {
          dateTimeFilter: {
            createdAt: {
              startAt: lastSyncTime,
              endAt: now
            }
          }
        }
      }
    })

    const refundedOrders = refundResult.orders?.filter(order => 
      order.refunds && order.refunds.length > 0
    ) || []
    console.log(`Found ${refundedOrders.length} Square refunded orders since ${lastSyncTime}`)

    // Create map of order ID to refund info
    interface RefundInfo {
      amount: number;
      date: string | undefined;
    }
    const refundMap = new Map<string, RefundInfo>(
      refundedOrders
        .filter((order): order is Order & { id: string } => 
          !!order.id && !!order.refunds?.[0]?.amountMoney?.amount
        )
        .map((order) => [
          order.id,
          {
            amount: Number(order.refunds![0].amountMoney!.amount),
            date: order.refunds![0].createdAt
          }
        ])
    )

    // Process each order
    const operations = orders
      .filter((order): order is Order => !!order.id && !!order.totalMoney?.amount)
      .map(async (order) => {

      // First, check for and merge any existing duplicates
      const mergedTransaction = order.id ? await mergeDuplicateTransactions(order.id, 'square') : null

      // Check if transaction already exists
      const existing = mergedTransaction || await mongoose.model('Transaction').findOne({
        'platformMetadata.platform': 'square',
        'platformMetadata.orderId': order.id
      })

      // Determine transaction status
      let status: 'completed' | 'cancelled' | 'refunded' = 'completed'
      if (order.state === 'CANCELED') {
        status = 'cancelled'
      } else if (order.id && refundMap.has(order.id)) {
        status = 'refunded'
      }

      const refundInfo = order.id ? refundMap.get(order.id) : undefined

      // Calculate tax amounts
      const TAX_RATE = 0.08875;
      const totalAmount = order.totalMoney?.amount ? Number(order.totalMoney.amount) / 100 : 0;
      const tipAmount = order.tenders?.[0]?.tipMoney?.amount 
        ? Number(order.tenders[0].tipMoney.amount) / 100 
        : 0;
      
      // Subtotal includes tax but not tip
      const subtotal = totalAmount - tipAmount;
      // Work backwards to find pre-tax amount and round to 2 decimal places
      const preTaxAmount = Number((subtotal / (1 + TAX_RATE)).toFixed(2));
      const calculatedTax = Number((subtotal - preTaxAmount).toFixed(2));

      // Calculate Square processing fee (2.6% + $0.15)
      const processingFee = Number((totalAmount * 0.026 + 0.15).toFixed(2));

      console.log('[Square Sync] Tax calculation:', {
        totalAmount,
        tipAmount,
        subtotal,
        preTaxAmount,
        calculatedTax,
        processingFee,
        effectiveTaxRate: ((calculatedTax / preTaxAmount) * 100).toFixed(3) + '%'
      });

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
        await ProductModel.findOne({
          'platformMetadata.platform': 'square',
          'platformMetadata.productId': item.catalogObjectId
        }) : null;

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
              console.warn(`[Square Sync] Failed to fetch catalog object ${item.catalogObjectId}:`, catalogError);
            }
          }

          // Final fallback options
          if (!productName) {
            productName = (product?.name) || 
                         `Square Item ${item.catalogObjectId || 'Unknown'}`;
          }

          // Ensure productName is always a string
          const finalProductName = productName || 'Unknown Product';

          console.log(`[Square Sync] Product name resolution:`, {
            originalName: item.name,
            catalogObjectId: item.catalogObjectId,
            finalName: finalProductName,
            foundProduct: !!product
          });

          return {
            name: finalProductName,
            quantity: Number(item.quantity),
            unitPrice: Number(item.basePriceMoney?.amount || 0) / 100,
            totalPrice: Number(item.totalMoney?.amount || 0) / 100,
            isTaxable: true, // All Square products are taxable
            productId: product?._id || new mongoose.Types.ObjectId() // Use existing product ID if found, otherwise generate new one
          };
        }) || [])
      }

      if (existing) {
        // If transaction exists but status has changed, update it
        if ((existing as { status?: string }).status !== status) {
          await mongoose.model('Transaction').findOneAndUpdate(
            { _id: existing._id },
            { 
              $set: { 
                status,
                refundAmount: transaction.refundAmount,
                refundDate: transaction.refundDate,
                updatedAt: transaction.updatedAt
              } 
            },
            { new: true }
          )
          console.log(`Updated Square order ${order.id} status to ${status}`)
          return { action: 'updated', id: order.id }
        }
        console.log(`Square order ${order.id} already synced`)
        return { action: 'skipped', id: order.id }
      }

      // Create new transaction
      const newTransaction = await mongoose.model('Transaction').create({
        ...transaction,
        createdAt: new Date().toISOString()
      })

      // Update inventory for Viva Raw products
      if (transaction.products && transaction.products.length > 0) {
        try {
          const inventoryResults = await updateInventoryForNewTransaction(transaction.products)
          console.log(`[Square Sync] Inventory update results for order ${order.id}:`, inventoryResults)
        } catch (error) {
          console.error(`[Square Sync] Error updating inventory for order ${order.id}:`, error)
        }
      }

      console.log('Created transaction with platformMetadata:', {
        transactionId: newTransaction._id,
        orderId: order.id,
        platformMetadata: newTransaction.platformMetadata,
        fullTransaction: {
          ...newTransaction.toObject(),
          products: newTransaction.products.length + ' products'
        }
      })

      console.log(`Synced Square order ${order.id}`)
      return { action: 'created', id: order.id }
    })

    const results = await Promise.all(operations)
    const created = results.filter(r => r.action === 'created').length
    const updated = results.filter(r => r.action === 'updated').length
    const skipped = results.filter(r => r.action === 'skipped').length

    console.log(`[Square Sync] Phase 1 complete: ${created} created, ${updated} updated, ${skipped} skipped`)

    // Phase 2: Fetch actual processing fees for newly created/updated transactions
    const transactionsToUpdateFees = results.filter(r => r.action === 'created' || r.action === 'updated')
    console.log(`[Square Sync] Phase 2: Fetching actual fees for ${transactionsToUpdateFees.length} transactions`)

    let feesUpdated = 0
    let feesSkipped = 0

    if (transactionsToUpdateFees.length > 0) {
      const feeOperations = transactionsToUpdateFees.map(async (result) => {
        try {
          // Find the transaction in our database
          const transaction = await mongoose.model('Transaction').findOne({
            'platformMetadata.platform': 'square',
            'platformMetadata.orderId': result.id
          })

          if (!transaction) {
            console.warn(`[Square Sync] Transaction not found for order ${result.id}`)
            return { action: 'skipped', orderId: result.id }
          }

          // Call the actual fee API
          const feeResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/transactions/${transaction._id}/square-fees`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          })

          if (feeResponse.ok) {
            const feeData = await feeResponse.json()
            console.log(`[Square Sync] Updated actual fee for order ${result.id}: $${feeData.processingFee}`)
            return { action: 'updated', orderId: result.id, fee: feeData.processingFee }
          } else {
            console.warn(`[Square Sync] Failed to fetch actual fee for order ${result.id}:`, await feeResponse.text())
            return { action: 'skipped', orderId: result.id }
          }
        } catch (error) {
          console.warn(`[Square Sync] Error fetching actual fee for order ${result.id}:`, error)
          return { action: 'skipped', orderId: result.id }
        }
      })

      const feeResults = await Promise.all(feeOperations)
      feesUpdated = feeResults.filter(r => r.action === 'updated').length
      feesSkipped = feeResults.filter(r => r.action === 'skipped').length
      
      console.log(`[Square Sync] Phase 2 complete: ${feesUpdated} fees updated, ${feesSkipped} fees skipped`)
    }

    // Update last successful sync time
    await SyncStateModel.findOneAndUpdate(
      { source: 'square' },
      { 
        $set: { 
          lastSuccessfulSync: now,
          lastSyncStatus: 'success',
          lastSyncResults: { created, updated, skipped, feesUpdated, feesSkipped },
          updatedAt: now
        }
      },
      { upsert: true, new: true }
    )

    return NextResponse.json({
      success: true,
      results: { created, updated, skipped, feesUpdated, feesSkipped }
    })
  } catch (error) {
    console.error('Error syncing Square transactions:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync transactions' },
      { status: 500 }
    )
  }
} 