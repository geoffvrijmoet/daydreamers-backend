import { NextResponse } from 'next/server'
import { squareClient } from '@/lib/square'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate') || new Date().toISOString()
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    const { result } = await squareClient.ordersApi.searchOrders({
      locationIds: [process.env.SQUARE_LOCATION_ID!],
      dateTimeFilter: {
        startAt: startDate,
        endAt: endDate
      }
    })

    const orders = result.orders || []
    
    // Transform Square orders into our transaction format
    const transactions = orders.map(order => ({
      id: order.id,
      date: order.createdAt,
      type: 'sale',
      amount: order.totalMoney?.amount 
        ? parseFloat(order.totalMoney.amount) / 100
        : 0,
      description: `Order ${order.id}`
    }))

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Error fetching Square transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
} 