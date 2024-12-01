import { NextResponse } from 'next/server'
import { squareClient, validateSquareCredentials } from '@/lib/square'
import { shopifyClient } from '@/lib/shopify'
import { getDb } from '@/lib/db'
import { Transaction } from '@/types'

export async function GET(request: Request) {
  try {
    const db = await getDb()
    const { searchParams } = new URL(request.url)
    const startDate = '2023-03-28T00:00:00Z'
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    console.log('Fetching combined transactions with params:', {
      startDate,
      endDate
    })

    // Fetch manual transactions from MongoDB
    console.log('Fetching manual transactions...startDate:', startDate, 'endDate:', endDate)
    const manualTransactions = await db.collection('transactions')
      .find({
        source: 'manual',
        date: {
          $gte: startDate,
          $lte: endDate
        }
      })
      .toArray()

    console.log(`Found ${manualTransactions.length} manual transactions`)

    // Fetch Square transactions
    console.log('Fetching Square transactions...')
    const isSquareValid = await validateSquareCredentials()
    let squareTransactions: Transaction[] = []
    
    if (isSquareValid) {
      const squareResponse = await squareClient.ordersApi.searchOrders({
        locationIds: [process.env.SQUARE_LOCATION_ID!],
        query: {
          filter: {
            dateTimeFilter: {
              createdAt: {
                startAt: startDate,
                endAt: endDate
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

      squareTransactions = (squareResponse.result.orders || []).map(order => ({
        id: `square_${order.id}`,
        date: order.createdAt ?? new Date().toISOString(),
        type: 'sale',
        amount: order.totalMoney?.amount 
          ? Number(order.totalMoney.amount) / 100
          : 0,
        description: order.lineItems?.[0]?.name 
          ? `Square: ${order.lineItems[0].name}${order.lineItems.length > 1 ? ` (+${order.lineItems.length - 1} more)` : ''}`
          : `Square Order ${order.id}`,
        source: 'square'
      }))
    }

    // Fetch Shopify transactions
    console.log('Fetching Shopify transactions...')
    let shopifyTransactions: Transaction[] = []
    try {
      const shopifyOrders = await shopifyClient.order.list({
        created_at_min: startDate,
        created_at_max: endDate,
        status: 'any',
        limit: 100
      })

      shopifyTransactions = shopifyOrders.map(order => ({
        id: `shopify_${order.id}`,
        date: order.created_at ?? new Date().toISOString(),
        type: 'sale',
        amount: Number(order.total_price),
        description: order.line_items?.[0]?.title 
          ? `Shopify: ${order.line_items[0].title}${order.line_items.length > 1 ? ` (+${order.line_items.length - 1} more)` : ''}`
          : `Shopify Order #${order.order_number}`,
        source: 'shopify'
      }))
    } catch (error) {
      console.error('Shopify fetch error:', error)
    }

    // Combine all transactions
    const allTransactions = [
      ...manualTransactions,
      ...squareTransactions,
      ...shopifyTransactions
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    console.log('Total combined transactions:', {
      manual: manualTransactions.length,
      square: squareTransactions.length,
      shopify: shopifyTransactions.length,
      total: allTransactions.length
    })

    return NextResponse.json({ transactions: allTransactions })
  } catch (error) {
    console.error('Error fetching combined transactions:', error)
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
} 