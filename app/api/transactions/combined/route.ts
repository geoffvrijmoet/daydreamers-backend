import { NextResponse } from 'next/server'
import { squareClient, validateSquareCredentials } from '@/lib/square'
import { shopifyClient } from '@/lib/shopify'
import { Transaction } from '@/types'

export async function GET(request: Request) {
  try {
    // First validate Square credentials
    const isValid = await validateSquareCredentials()
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid Square credentials' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate') || '2024-01-01T00:00:00Z'
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    console.log('Fetching combined transactions with params:', {
      startDate,
      endDate
    })

    // Fetch Square transactions
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

    // Fetch Shopify orders
    const shopifyOrders = await shopifyClient.order.list({
      created_at_min: startDate,
      created_at_max: endDate,
      status: 'any',
      limit: 100
    })

    console.log('Found orders:', {
      square: squareResponse.result.orders?.length || 0,
      shopify: shopifyOrders.length
    })

    // Transform Square orders
    const squareTransactions: Transaction[] = (squareResponse.result.orders || []).map(order => ({
      id: `square_${order.id}`,
      date: order.createdAt ?? new Date().toISOString(),
      type: 'sale' as const,
      amount: order.totalMoney?.amount 
        ? Number(order.totalMoney.amount) / 100
        : 0,
      description: order.lineItems?.[0]?.name 
        ? `Square: ${order.lineItems[0].name}${order.lineItems.length > 1 ? ` (+${order.lineItems.length - 1} more)` : ''}`
        : `Square Order ${order.id}`,
      source: 'square' as const
    }))

    // Transform Shopify orders
    const shopifyTransactions: Transaction[] = shopifyOrders.map(order => ({
      id: `shopify_${order.id}`,
      date: order.created_at ?? new Date().toISOString(),
      type: 'sale' as const,
      amount: Number(order.total_price),
      description: order.line_items?.[0]?.title 
        ? `Shopify: ${order.line_items[0].title}${order.line_items.length > 1 ? ` (+${order.line_items.length - 1} more)` : ''}`
        : `Shopify Order #${order.order_number}`,
      source: 'shopify' as const
    }))

    // Combine and sort by date
    const allTransactions = [...squareTransactions, ...shopifyTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    console.log('Total combined transactions:', allTransactions.length)

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