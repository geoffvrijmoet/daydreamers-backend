import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log('Received transaction body:', body)
    
    // Generate a unique ID combining timestamp and random string
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 10)
    const uniqueId = `manual_${timestamp}_${random}`
    
    // Convert date to Eastern Time
    const date = new Date(body.date)
    const nyDate = new Date(date.toLocaleString('en-US', {
      timeZone: 'America/New_York'
    }))
    
    // Calculate tip/discount
    const productsTotal = body.products?.reduce((sum: number, product: any) => 
      sum + (parseFloat(product.totalPrice) || 0), 0) || 0
    const difference = parseFloat(body.amount) - productsTotal
    const tip = difference > 0 ? difference : undefined
    const discount = difference < 0 ? Math.abs(difference) : undefined
    
    const db = await getDb()
    const transaction = await db.collection('transactions').insertOne({
      id: uniqueId,
      date: nyDate.toISOString().replace('Z', '-05:00'),
      amount: parseFloat(body.amount),
      type: body.type,
      paymentMethod: body.paymentMethod,
      customer: body.customer,
      vendor: body.vendor,
      supplierOrderNumber: body.supplierOrderNumber,
      products: body.products?.map((product: any) => ({
        productId: product.productId,
        name: product.name,
        quantity: parseInt(product.quantity),
        unitPrice: parseFloat(product.unitPrice),
        totalPrice: parseFloat(product.totalPrice)
      })) || [],
      productsTotal,
      tip,
      discount,
      createdAt: new Date(),
      updatedAt: new Date(),
      source: "manual",
    })
    
    return NextResponse.json({ 
      id: uniqueId,
      ...body,
      productsTotal,
      tip,
      discount
    })
  } catch (error) {
    console.error('Failed to create transaction:', error)
    return NextResponse.json(
      { error: 'Failed to create transaction', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const db = await getDb()
    const { id, ...updates } = await request.json()

    // If date is being updated, ensure it's in NY timezone
    if (updates.date) {
      const date = new Date(updates.date)
      const nyDate = new Date(date.toLocaleString('en-US', {
        timeZone: 'America/New_York'
      }))
      updates.date = nyDate.toISOString().replace('Z', '-05:00')
    }

    const result = await db.collection('transactions').findOneAndUpdate(
      { id },
      { 
        $set: {
          ...updates,
          updatedAt: new Date().toISOString().replace('Z', '-05:00')
        }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, transaction: result })
  } catch (error) {
    console.error('Error updating transaction:', error)
    return NextResponse.json(
      { error: 'Failed to update transaction' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    const db = await getDb()

    const result = await db.collection('transactions').deleteOne({ id })

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting transaction:', error)
    return NextResponse.json(
      { error: 'Failed to delete transaction' },
      { status: 500 }
    )
  }
} 