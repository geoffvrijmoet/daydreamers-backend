import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface DateQuery {
  date?: {
    $gte?: string;
    $lte?: string;
  };
}

export async function GET(request: Request) {
  try {
    const db = await getDb()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const query: DateQuery = {}
    if (startDate) query.date = { $gte: startDate }
    if (endDate) query.date = { ...query.date, $lte: endDate }

    const transactions = await db.collection('transactions')
      .find(query)
      .sort({ date: -1 })
      .toArray()

    return NextResponse.json({ transactions })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDb()
    const data = await request.json()
    
    console.log('🔍 Received transaction data:', data);
    
    // Ensure products have correct data types
    if (data.products && Array.isArray(data.products)) {
      data.products = data.products.map((product: { 
        name: string, 
        quantity: number | string, 
        unitPrice: number | string, 
        totalPrice: number | string,
        productId?: string 
      }) => ({
        ...product,
        quantity: Number(product.quantity),
        unitPrice: Number(product.unitPrice),
        totalPrice: Number(product.totalPrice),
      }));
      
      console.log('📦 Processed products:', data.products);
    }
    
    const now = new Date().toISOString()
    const transaction = {
      ...data,
      createdAt: now,
      updatedAt: now
    }

    const result = await db.collection('transactions').insertOne(transaction)
    
    return NextResponse.json({ 
      success: true, 
      id: result.insertedId,
      message: 'Transaction created successfully'
    })
  } catch (error) {
    console.error('Error creating transaction:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create transaction' },
      { status: 500 }
    )
  }
} 