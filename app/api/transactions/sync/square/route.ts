import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'
import { getDb } from '@/lib/db'
import { Transaction } from '@/types'

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    
    const db = await getDb()
    console.log('Starting Square transactions sync...')

    // Get last sync timestamp if no dates provided
    const syncState = await db.collection('syncState').findOne({ source: 'square' })
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
            states: ['COMPLETED']
          }
        },
        sort: {
          sortField: 'CREATED_AT',
          sortOrder: 'DESC'
        }
      },
      limit: 100
    })

    const orders = result.orders || []
    console.log(`Found ${orders.length} new Square orders since ${lastSyncTime}`)

    // Process each order
    const operations = orders.map(async (order) => {
      const squareId = `square_${order.id}`

      // Check if transaction already exists
      const existing = await db.collection('transactions').findOne({ id: squareId })
      if (existing) {
        console.log(`Square order ${order.id} already synced`)
        return { action: 'skipped', id: order.id }
      }

      const transaction: Omit<Transaction, '_id'> = {
        id: squareId,
        date: order.createdAt ?? new Date().toISOString(),
        type: 'sale',
        amount: order.totalMoney?.amount 
          ? Number(order.totalMoney.amount) / 100
          : 0,
        preTaxAmount: order.totalMoney?.amount 
          ? (Number(order.totalMoney.amount) - Number(order.totalTaxMoney?.amount || 0)) / 100
          : 0,
        taxAmount: order.totalTaxMoney?.amount 
          ? Number(order.totalTaxMoney.amount) / 100
          : 0,
        description: order.lineItems?.[0]?.name 
          ? `Square: ${order.lineItems[0].name}${order.lineItems.length > 1 ? ` (+${order.lineItems.length - 1} more)` : ''}`
          : `Square Order ${order.id}`,
        source: 'square',
        lineItems: order.lineItems?.map(item => ({
          name: item.name || '',
          quantity: Number(item.quantity),
          price: Number(item.basePriceMoney?.amount || 0) / 100,
          sku: item.catalogObjectId || undefined
        })) || [],
        customer: order.customerId || undefined,
        paymentMethod: order.tenders?.[0]?.type,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await db.collection('transactions').insertOne(transaction)
      console.log(`Synced Square order ${order.id}`)
      return { action: 'created', id: order.id }
    })

    const results = await Promise.all(operations)
    const created = results.filter(r => r.action === 'created').length
    const skipped = results.filter(r => r.action === 'skipped').length

    // Update last successful sync time
    await db.collection('syncState').updateOne(
      { source: 'square' },
      { 
        $set: { 
          lastSuccessfulSync: now,
          lastSyncStatus: 'success',
          lastSyncResults: { created, skipped },
          updatedAt: now
        }
      },
      { upsert: true }
    )

    console.log('Square sync complete:', { created, skipped })

    return NextResponse.json({
      message: `Sync complete. Created: ${created}, Skipped: ${skipped} transactions`,
      details: results
    })

  } catch (error) {
    console.error('Error syncing Square transactions:', error)
    
    // Update sync state with error
    const db = await getDb()
    await db.collection('syncState').updateOne(
      { source: 'square' },
      { 
        $set: { 
          lastSyncStatus: 'error',
          lastError: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    )

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync transactions' },
      { status: 500 }
    )
  }
} 