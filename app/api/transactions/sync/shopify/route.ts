import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/mongoose'
import { shopifyClient } from '@/lib/shopify'
import SyncStateModel from '@/lib/models/SyncState'
import TransactionModel from '@/lib/models/transaction'
import ProductModel from '@/lib/models/Product'
import { updateInventoryForNewTransaction } from '@/lib/utils/inventory-management'
import { mergeDuplicateTransactions } from '@/lib/utils/transaction-merge'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { startDate, endDate } = body
    
    await connectToDatabase()
    console.log('Starting Shopify transactions sync...')

    // Get last sync timestamp if no dates provided
    const syncState = await SyncStateModel.findOne({ source: 'shopify' })
    const lastSyncTime = startDate || syncState?.lastSuccessfulSync || '2023-01-01T00:00:00Z'
    const now = endDate || new Date().toISOString()

    console.log('Sync time range:', { start: lastSyncTime, end: now })

    // Get orders from Shopify since last sync
    const orders = await shopifyClient.order.list({
      created_at_min: lastSyncTime,
      created_at_max: now,
      status: 'any', // Include all order statuses
      limit: 250 // Maximum allowed by Shopify
    })

    console.log(`Found ${orders.length} Shopify orders since ${lastSyncTime}`)

    // Process each order
    const operations = orders.map(async (order) => {
      // First, check for and merge any existing duplicates
      const mergedTransaction = await mergeDuplicateTransactions(order.id.toString(), 'shopify')
      
      // Check for existing transaction with this order ID
      const existing = mergedTransaction || await TransactionModel.findOne({
        $or: [
          // New format: check platformMetadata.orderId
          { 'platformMetadata.orderId': order.id.toString() },
          // Old format: check shopifyOrderId field
          { shopifyOrderId: order.id.toString() },
          // Very old format: check id field with shopify_ prefix
          { id: `shopify_${order.id}` },
          // Also check paymentProcessing.transactionId for old transactions
          { 'paymentProcessing.transactionId': order.id.toString() }
        ]
      })

      if (existing) {
        console.log(`Found existing Shopify transaction for order ${order.id}:`, {
          existingId: existing._id,
          hasPlatformMetadata: !!existing.platformMetadata,
          hasShopifyOrderId: !!(existing as { shopifyOrderId?: string }).shopifyOrderId,
          hasOldId: !!(existing as { id?: string }).id,
          hasPaymentProcessingId: !!(existing as { paymentProcessing?: { transactionId?: string } }).paymentProcessing?.transactionId
        })
      }

      // Calculate tax amounts
      const totalAmount = Number(order.total_price)
      const taxAmount = Number(order.total_tax) || 0
      const preTaxAmount = totalAmount - taxAmount
      const shippingAmount = Number(order.total_shipping_price_set?.shop_money?.amount || 0)
      const discountAmount = Number(order.total_discounts || 0)

      // Calculate Shopify processing fee (2.9% + $0.30)
      const processingFee = Number((totalAmount * 0.029 + 0.30).toFixed(2))

      const transaction = {
        type: 'sale' as const,
        date: new Date(order.created_at),
        amount: totalAmount, // Ensure this is a number
        preTaxAmount,
        taxAmount,
        shipping: shippingAmount,
        discount: discountAmount,
        status: order.financial_status === 'paid' ? 'completed' : 'pending',
        source: 'shopify' as const,
        customer: order.customer?.id ? `shopify_${order.customer.id}` : undefined,
        email: order.customer?.email,
        isTaxable: true,
        draft: false,
        paymentProcessing: {
          fee: processingFee,
          provider: 'Shopify',
          transactionId: order.id.toString()
        },
        platformMetadata: {
          platform: 'shopify' as const,
          orderId: order.id.toString(),
          data: {
            orderId: order.id.toString(),
            orderNumber: order.order_number.toString(),
            gateway: order.gateway || 'unknown',
            createdAt: order.created_at,
            updatedAt: order.updated_at
          }
        },
        shopifyOrderId: order.id.toString(),
        shopifyTotalTax: taxAmount,
        shopifySubtotalPrice: preTaxAmount,
        shopifyTotalPrice: totalAmount,
        shopifyPaymentGateway: order.gateway,
        products: await Promise.all(order.line_items.map(async item => {
          // Try to find the MongoDB product using multiple strategies
          let product = null
          
          if (item.product_id) {
            // Strategy 1: Try to find by numeric product ID
            product = await ProductModel.findOne({
              'platformMetadata.platform': 'shopify',
              'platformMetadata.productId': item.product_id.toString()
            })
            
            // Strategy 2: Try to find by GID format
            if (!product) {
              const gid = `gid://shopify/Product/${item.product_id}`
              product = await ProductModel.findOne({
                'platformMetadata.platform': 'shopify',
                'platformMetadata.productId': gid
              })
            }
            
            // Strategy 3: Try to find by variant ID (numeric)
            if (!product && item.variant_id) {
              product = await ProductModel.findOne({
                'platformMetadata.platform': 'shopify',
                'platformMetadata.variantId': item.variant_id.toString()
              })
            }
            
            // Strategy 4: Try to find by variant GID
            if (!product && item.variant_id) {
              const variantGid = `gid://shopify/ProductVariant/${item.variant_id}`
              product = await ProductModel.findOne({
                'platformMetadata.platform': 'shopify',
                'platformMetadata.variantId': variantGid
              })
            }
          }

          return {
            name: item.title,
            quantity: item.quantity,
            unitPrice: Number(item.price),
            totalPrice: Number(item.price) * item.quantity,
            isTaxable: true, // All Shopify products are taxable
            productId: product?._id || new mongoose.Types.ObjectId() // Use existing product ID if found, otherwise generate new one
          }
        }))
      }

      if (existing) {
        // Debug: Log the existing transaction structure
        const transactionDoc = existing as {
          lineItems?: unknown[];
          products?: unknown[];
          preTaxAmount?: number;
          isTaxable?: boolean;
          draft?: boolean;
          status?: string;
        }
        
        console.log(`Checking existing Shopify transaction ${order.id}:`, {
          hasLineItems: !!transactionDoc.lineItems,
          hasProducts: !!transactionDoc.products,
          amountType: typeof existing.amount,
          amountValue: existing.amount,
          hasPreTaxAmount: 'preTaxAmount' in transactionDoc,
          preTaxAmountValue: transactionDoc.preTaxAmount,
          hasIsTaxable: 'isTaxable' in transactionDoc,
          isTaxableValue: transactionDoc.isTaxable,
          hasDraft: 'draft' in transactionDoc,
          draftValue: transactionDoc.draft,
          platformMetadataKeys: existing.platformMetadata?.data ? Object.keys(existing.platformMetadata.data) : 'no data'
        })
        
        // Debug: Log ALL fields in the document
        console.log(`Full document structure for ${order.id}:`, JSON.stringify(existing.toObject(), null, 2))

        // Check if existing transaction needs data structure fixes
        const docObject = existing.toObject()
        const hasLineItems = 'lineItems' in docObject && Array.isArray(docObject.lineItems)
        const hasProducts = 'products' in docObject && Array.isArray(docObject.products)
        const amountIsString = typeof existing.amount === 'string'
        const missingPreTaxAmount = !('preTaxAmount' in transactionDoc) || transactionDoc.preTaxAmount === undefined || transactionDoc.preTaxAmount === null
        const missingIsTaxable = !('isTaxable' in transactionDoc) || transactionDoc.isTaxable === undefined || transactionDoc.isTaxable === null
        const missingDraft = !('draft' in transactionDoc) || transactionDoc.draft === undefined
        const hasBloatedMetadata = existing.platformMetadata?.data && Object.keys(existing.platformMetadata.data).length > 10
        
        const needsDataFix = 
          // Check for bloated platformMetadata
          hasBloatedMetadata ||
          // Check for lineItems field (wrong field name)
          hasLineItems ||
          // Check for line_items in platformMetadata
          (existing.platformMetadata?.data as { line_items?: unknown })?.line_items ||
          // Check for full customer object in platformMetadata
          (existing.platformMetadata?.data as { customer?: { email?: string } })?.customer?.email ||
          // Check for string amount
          amountIsString ||
          // Check for missing required fields
          missingPreTaxAmount ||
          missingIsTaxable ||
          !hasProducts ||
          missingDraft ||
          // TEMPORARILY FORCE FIX TO RUN FOR DEBUGGING
          true
        
        console.log(`Data fix needed: ${needsDataFix}`, {
          hasLineItems,
          amountIsString,
          missingPreTaxAmount,
          missingIsTaxable,
          missingDraft,
          hasBloatedMetadata
        })
        
        if (needsDataFix) {
          console.log(`Fixing bloated/incorrect Shopify transaction ${order.id} data structure`)
          
          // ALWAYS try to remove lineItems field regardless of detection
          try {
            // Use direct MongoDB collection operation to force remove lineItems
            const db = mongoose.connection.db
            if (!db) {
              console.log(`Database not connected for order ${order.id}`)
              return { action: 'skipped', id: order.id }
            }
            const collection = db.collection('transactions')
            
            const result = await collection.updateOne(
              { _id: existing._id as mongoose.Types.ObjectId },
              { $unset: { lineItems: "" } }
            )
            
            console.log(`MongoDB update result for lineItems removal:`, {
              orderId: order.id,
              matchedCount: result.matchedCount,
              modifiedCount: result.modifiedCount,
              acknowledged: result.acknowledged
            })
            
            if (result.modifiedCount > 0) {
              console.log(`Successfully removed lineItems field from Shopify order ${order.id}`)
            } else {
              console.log(`No lineItems field found to remove for order ${order.id}`)
            }
          } catch (error) {
            console.log(`Error removing lineItems field for order ${order.id}:`, (error as Error).message)
          }
          
          // Step 2: Update with correct data structure
          console.log(`About to update transaction ${order.id} with new data structure`)
          
          const updateData = {
            // Fix platformMetadata to only include essential data
            platformMetadata: {
              platform: 'shopify' as const,
              orderId: order.id.toString(),
              data: {
                // Temporarily include full order data for debugging customer info
                fullOrder: order,
                // Keep essential fields for reference
                orderId: order.id.toString(),
                orderNumber: order.order_number.toString(),
                gateway: order.gateway || 'unknown',
                createdAt: order.created_at,
                updatedAt: order.updated_at
              }
            },
            // Fix products array if it's missing or wrong
            products: await Promise.all(order.line_items.map(async item => {
              // Try to find the MongoDB product using multiple strategies
              let product = null
              
              if (item.product_id) {
                // Strategy 1: Try to find by numeric product ID
                product = await ProductModel.findOne({
                  'platformMetadata.platform': 'shopify',
                  'platformMetadata.productId': item.product_id.toString()
                })
                
                // Strategy 2: Try to find by GID format
                if (!product) {
                  const gid = `gid://shopify/Product/${item.product_id}`
                  product = await ProductModel.findOne({
                    'platformMetadata.platform': 'shopify',
                    'platformMetadata.productId': gid
                  })
                }
                
                // Strategy 3: Try to find by variant ID (numeric)
                if (!product && item.variant_id) {
                  product = await ProductModel.findOne({
                    'platformMetadata.platform': 'shopify',
                    'platformMetadata.variantId': item.variant_id.toString()
                  })
                }
                
                // Strategy 4: Try to find by variant GID
                if (!product && item.variant_id) {
                  const variantGid = `gid://shopify/ProductVariant/${item.variant_id}`
                  product = await ProductModel.findOne({
                    'platformMetadata.platform': 'shopify',
                    'platformMetadata.variantId': variantGid
                  })
                }
              }

              return {
                name: item.title,
                quantity: item.quantity,
                unitPrice: Number(item.price),
                totalPrice: Number(item.price) * item.quantity,
                isTaxable: true,
                productId: product?._id || new mongoose.Types.ObjectId()
              }
            })),
            // Update other fields that might be wrong
            date: new Date(order.created_at),
            amount: totalAmount, // Ensure this is a number
            preTaxAmount,
            taxAmount,
            shipping: shippingAmount,
            discount: discountAmount,
            status: order.financial_status === 'paid' ? 'completed' : 'pending',
            customer: order.customer?.first_name && order.customer?.last_name 
              ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
              : order.customer?.first_name || order.customer?.last_name || order.customer?.email || undefined,
            email: order.customer?.email,
            isTaxable: true,
            draft: false,
            paymentProcessing: {
              fee: processingFee,
              provider: 'Shopify',
              transactionId: order.id.toString()
            },
            shopifyOrderId: order.id.toString(),
            shopifyTotalTax: taxAmount,
            shopifySubtotalPrice: preTaxAmount,
            shopifyTotalPrice: totalAmount,
            shopifyPaymentGateway: order.gateway,
            updatedAt: new Date()
          }
          
          console.log(`Update data for ${order.id}:`, {
            productsCount: updateData.products.length,
            preTaxAmount: updateData.preTaxAmount,
            isTaxable: updateData.isTaxable,
            amount: updateData.amount,
            customer: updateData.customer,
            customerData: {
              id: order.customer?.id,
              firstName: order.customer?.first_name,
              lastName: order.customer?.last_name,
              email: order.customer?.email,
              // Add more customer fields for debugging
              fullCustomer: order.customer,
              billingAddress: order.billing_address,
              shippingAddress: order.shipping_address
            }
          })
          
          const updateResult = await TransactionModel.findOneAndUpdate(
            { _id: existing._id },
            { $set: updateData },
            { new: true }
          )
          
          console.log(`Update result for ${order.id}:`, {
            success: !!updateResult,
            hasProducts: !!(updateResult as typeof transactionDoc)?.products,
            productsCount: (updateResult as typeof transactionDoc)?.products?.length,
            hasPreTaxAmount: !!(updateResult as typeof transactionDoc)?.preTaxAmount,
            hasIsTaxable: !!(updateResult as typeof transactionDoc)?.isTaxable
          })
          
          // Use direct MongoDB collection operation to ensure data is saved
          try {
            const db = mongoose.connection.db
            if (!db) {
              console.log(`Database not connected for direct update of order ${order.id}`)
              return { action: 'skipped', id: order.id }
            }
            const collection = db.collection('transactions')
            
            const directUpdateResult = await collection.updateOne(
              { _id: existing._id as mongoose.Types.ObjectId },
              { $set: updateData }
            )
            
            console.log(`Direct MongoDB update result for ${order.id}:`, {
              matchedCount: directUpdateResult.matchedCount,
              modifiedCount: directUpdateResult.modifiedCount,
              acknowledged: directUpdateResult.acknowledged
            })
            
            if (directUpdateResult.modifiedCount > 0) {
              console.log(`Successfully updated transaction ${order.id} with direct MongoDB operation`)
            } else {
              console.log(`No changes made to transaction ${order.id} with direct MongoDB operation`)
            }
          } catch (error) {
            console.log(`Error with direct MongoDB update for ${order.id}:`, (error as Error).message)
          }
          
          console.log(`Fixed Shopify order ${order.id} data structure`)
          return { action: 'updated', id: order.id }
        }
        
        // Check if existing transaction is missing a date and update it
        const needsDateUpdate = !existing.date || existing.date === null || existing.date === undefined
        
        if (needsDateUpdate) {
          await TransactionModel.findOneAndUpdate(
            { _id: existing._id },
            { 
              $set: { 
                date: new Date(order.created_at),
                updatedAt: new Date()
              } 
            },
            { new: true }
          )
          console.log(`Updated Shopify order ${order.id} with missing date: ${order.created_at}`)
          return { action: 'updated', id: order.id }
        }
        
        // If transaction exists but status has changed, update it
        if (transactionDoc.status !== transaction.status) {
          await TransactionModel.findOneAndUpdate(
            { _id: existing._id },
            { 
              $set: { 
                status: transaction.status,
                updatedAt: new Date()
              } 
            },
            { new: true }
          )
          console.log(`Updated Shopify order ${order.id} status to ${transaction.status}`)
          return { action: 'updated', id: order.id }
        }
        console.log(`Shopify order ${order.id} already synced`)
        return { action: 'skipped', id: order.id }
      }

      // Create new transaction
      const newTransaction = await TransactionModel.create({
        ...transaction,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      // Update inventory for Viva Raw products
      if (transaction.products && transaction.products.length > 0) {
        try {
          const inventoryResults = await updateInventoryForNewTransaction(transaction.products)
          console.log(`[Shopify Sync] Inventory update results for order ${order.id}:`, inventoryResults)
        } catch (error) {
          console.error(`[Shopify Sync] Error updating inventory for order ${order.id}:`, error)
        }
      }

      console.log('Created transaction with platformMetadata:', {
        transactionId: newTransaction._id,
        orderId: order.id,
        platformMetadata: newTransaction.platformMetadata,
        fullTransaction: {
          ...newTransaction.toObject(),
          products: (newTransaction as { products?: unknown[] }).products?.length + ' products'
        }
      })

      console.log(`Synced Shopify order ${order.id}`)
      return { action: 'created', id: order.id }
    })

    const results = await Promise.all(operations)
    const created = results.filter(r => r.action === 'created').length
    const updated = results.filter(r => r.action === 'updated').length
    const skipped = results.filter(r => r.action === 'skipped').length

    console.log(`[Shopify Sync] Phase 1 complete: ${created} created, ${updated} updated, ${skipped} skipped`)

    // Phase 2: Fetch actual processing fees for newly created/updated transactions
    const transactionsToUpdateFees = results.filter(r => r.action === 'created' || r.action === 'updated')
    console.log(`[Shopify Sync] Phase 2: Fetching actual fees for ${transactionsToUpdateFees.length} transactions`)

    let feesUpdated = 0
    let feesSkipped = 0

    if (transactionsToUpdateFees.length > 0) {
      const feeOperations = transactionsToUpdateFees.map(async (result) => {
        try {
          // Find the transaction in our database
          const transaction = await TransactionModel.findOne({
            'platformMetadata.platform': 'shopify',
            'platformMetadata.orderId': result.id.toString()
          })

          if (!transaction) {
            console.warn(`[Shopify Sync] Transaction not found for order ${result.id}`)
            return { action: 'skipped', orderId: result.id }
          }

          // Call the actual fee API
          const feeResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/transactions/${transaction._id}/shopify-fees`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          })

          if (feeResponse.ok) {
            const feeData = await feeResponse.json()
            console.log(`[Shopify Sync] Updated actual fee for order ${result.id}: $${feeData.processingFee}`)
            return { action: 'updated', orderId: result.id, fee: feeData.processingFee }
          } else {
            console.warn(`[Shopify Sync] Failed to fetch actual fee for order ${result.id}:`, await feeResponse.text())
            return { action: 'skipped', orderId: result.id }
          }
        } catch (error) {
          console.warn(`[Shopify Sync] Error fetching actual fee for order ${result.id}:`, error)
          return { action: 'skipped', orderId: result.id }
        }
      })

      const feeResults = await Promise.all(feeOperations)
      feesUpdated = feeResults.filter(r => r.action === 'updated').length
      feesSkipped = feeResults.filter(r => r.action === 'skipped').length
      
      console.log(`[Shopify Sync] Phase 2 complete: ${feesUpdated} fees updated, ${feesSkipped} fees skipped`)
    }

    // Update last successful sync time
    await SyncStateModel.findOneAndUpdate(
      { source: 'shopify' },
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
    console.error('Error syncing Shopify transactions:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync transactions' },
      { status: 500 }
    )
  }
} 