import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { Transaction } from '@/types'
import type { Order } from 'square'

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    
    await connectToDatabase()
    console.log('Starting Square transactions sync...')

    // Get last sync timestamp if no dates provided
    const syncState = await mongoose.model('SyncState').findOne({ source: 'square' })
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
      const squareId = `square_${order.id}`

      // Check if transaction already exists
      const existing = await mongoose.model('Transaction').findOne({ id: squareId })

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
      // Work backwards to find pre-tax amount
      const preTaxAmount = subtotal / (1 + TAX_RATE);
      const calculatedTax = subtotal - preTaxAmount;

      console.log('[Square Sync] Tax calculation:', {
        totalAmount,
        tipAmount,
        subtotal,
        preTaxAmount,
        calculatedTax,
        effectiveTaxRate: ((calculatedTax / preTaxAmount) * 100).toFixed(3) + '%'
      });

      const transaction: Omit<Transaction, '_id'> = {
        id: squareId,
        date: order.createdAt ?? new Date().toISOString(),
        type: 'sale',
        amount: totalAmount,
        preTaxAmount,
        taxAmount: calculatedTax,
        tip: tipAmount || undefined,
        description: order.lineItems?.[0]?.name 
          ? `Square: ${order.lineItems[0].name}${order.lineItems.length > 1 ? ` (+${order.lineItems.length - 1} more)` : ''}`
          : `Square Order #${order.id}`,
        source: 'square',
        lineItems: order.lineItems?.map(item => ({
          name: item.name || '',
          quantity: Number(item.quantity),
          price: item.basePriceMoney?.amount ? Number(item.basePriceMoney.amount) / 100 : 0,
          sku: item.catalogObjectId || undefined
        })),
        customer: order.customerId ?? '',
        paymentMethod: order.tenders?.[0]?.type ?? undefined,
        status,
        refundAmount: refundInfo?.amount ? Number(refundInfo.amount) / 100 : undefined,
        refundDate: refundInfo?.date,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      if (existing) {
        // If transaction exists but status has changed, update it
        if (existing.status !== status) {
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
      await mongoose.model('Transaction').create({
        ...transaction,
        createdAt: new Date().toISOString()
      })
      console.log(`Synced Square order ${order.id}`)
      return { action: 'created', id: order.id }
    })

    const results = await Promise.all(operations)
    const created = results.filter(r => r.action === 'created').length
    const updated = results.filter(r => r.action === 'updated').length
    const skipped = results.filter(r => r.action === 'skipped').length

    // Update last successful sync time
    await mongoose.model('SyncState').findOneAndUpdate(
      { source: 'square' },
      { 
        $set: { 
          lastSuccessfulSync: now,
          lastSyncStatus: 'success',
          lastSyncResults: { created, updated, skipped },
          updatedAt: now
        }
      },
      { upsert: true, new: true }
    )

    return NextResponse.json({
      success: true,
      results: { created, updated, skipped }
    })
  } catch (error) {
    console.error('Error syncing Square transactions:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync transactions' },
      { status: 500 }
    )
  }
} 