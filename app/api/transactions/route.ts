import { NextResponse } from 'next/server'
import { squareClient, validateSquareCredentials } from '@/lib/square'

export async function GET(request: Request) {
  try {
    // First validate credentials
    const isValid = await validateSquareCredentials()
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid Square credentials' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    // Set a wider date range for testing
    const startDate = searchParams.get('startDate') || '2024-01-01T00:00:00Z'
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    console.log('Fetching orders with params:', {
      startDate,
      endDate,
      locationId: process.env.SQUARE_LOCATION_ID
    })

    const { result } = await squareClient.ordersApi.searchOrders({
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
            states: ['COMPLETED'] // Add state filter to get completed orders
          }
        },
        sort: {
          sortField: 'CREATED_AT',
          sortOrder: 'DESC'
        }
      },
      limit: 100 // Add limit to get more orders
    })

    const orders = result.orders || []
    console.log('Found orders:', orders.length)
    console.log('First few orders:', orders.slice(0, 3))
    
    const transactions = orders.map(order => ({
      id: order.id,
      date: order.createdAt ?? new Date().toISOString(),
      type: 'sale' as const,
      amount: order.totalMoney?.amount 
        ? Number(order.totalMoney.amount) / 100
        : 0,
      description: order.lineItems?.[0]?.name 
        ? `Order: ${order.lineItems[0].name}${order.lineItems.length > 1 ? ` (+${order.lineItems.length - 1} more)` : ''}`
        : `Order ${order.id}`,
      source: 'square' as const
    }))

    console.log('Transformed transactions:', transactions.slice(0, 3))

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Square API Error:', error)
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