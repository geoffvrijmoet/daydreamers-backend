import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface TransactionQuery {
  date?: {
    $gte?: string;
    $lte?: string;
  };
  type?: string;
}

export async function GET(request: Request) {
  try {
    const db = await getDb()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const type = searchParams.get('type')
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : undefined

    const query: TransactionQuery = {}
    if (startDate) query.date = { $gte: startDate }
    if (endDate) query.date = { ...query.date, $lte: endDate }
    if (type) query.type = type

    let cursor = db.collection('transactions')
      .find(query)
      .sort({ date: -1 })
      
    if (limit) {
      cursor = cursor.limit(limit)
    }

    const transactions = await cursor.toArray()

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
    
    // Ensure supplierOrderNumber is always a string
    if (data.supplierOrderNumber !== undefined && data.supplierOrderNumber !== null) {
      data.supplierOrderNumber = String(data.supplierOrderNumber);
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