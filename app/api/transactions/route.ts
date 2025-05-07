import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import TransactionModel from '@/lib/models/transaction'
import mongoose from 'mongoose'

interface TransactionQuery {
  date?: {
    $gte?: Date;
    $lte?: Date;
  };
  type?: string;
}

export async function GET(request: Request) {
  try {
    await connectToDatabase()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const type = searchParams.get('type')
    const limitParam = searchParams.get('limit')
    const skipParam = searchParams.get('skip')
    const limit = limitParam ? parseInt(limitParam, 10) : undefined
    const skip = skipParam ? parseInt(skipParam, 10) : 0

    const query: TransactionQuery = {}
    
    // Date range handling
    if (startDate || endDate) {
      query.date = {}
      
      if (startDate) {
        // Create date from the startDate string and ensure it's a Date object
        const start = new Date(startDate)
        // Set time to beginning of day (00:00:00.000)
        start.setUTCHours(0, 0, 0, 0)
        query.date.$gte = start
      }
      
      if (endDate) {
        // Create date from the endDate string and ensure it's a Date object
        const end = new Date(endDate)
        // Set time to end of day (23:59:59.999)
        end.setUTCHours(23, 59, 59, 999)
        query.date.$lte = end
      }
    }
    
    if (type) query.type = type

    // Fetch transactions
    const transactions = await TransactionModel
      .find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit || 100)
      .lean()
      .exec()

    // Log the results count
    console.log(`Fetched ${transactions.length} transactions for given criteria (skip: ${skip}, limit: ${limit || 100})`)

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase()
    const body = await request.json()
    const { 
      date, 
      amount, 
      merchant, 
      description, 
      type = 'expense', 
      source = 'manual',
      cardLast4, 
      emailId,
      products // Array of product data with costDiscount
    } = body
    
    interface TransactionWithProducts {
      date: Date;
      amount: number;
      description: string;
      merchant: string;
      type: string;
      source: string;
      cardLast4?: string;
      emailId?: string;
      createdAt: Date;
      updatedAt: Date;
      products?: Array<{
        name: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        costDiscount: number;
      }>;
    }
    
    const transaction: TransactionWithProducts = {
      date: new Date(date),
      amount: parseFloat(amount),
      description,
      merchant,
      type,
      source,
      cardLast4,
      emailId,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    // If products are provided, add them to the transaction
    if (products && Array.isArray(products) && products.length > 0) {
      transaction.products = products.map(product => ({
        name: product.name,
        quantity: product.quantity,
        unitPrice: product.unitPrice,
        totalPrice: product.totalPrice,
        costDiscount: product.costDiscount || 0
      }))
    }
    
    console.log('Creating transaction:', transaction)
    const result = await mongoose.connection.db!.collection('transactions').insertOne(transaction)
    
    // If this is from an email, mark the email as processed
    if (emailId) {
      await mongoose.connection.db!.collection('invoiceEmails').updateOne(
        { emailId },
        { 
          $set: { 
            status: 'processed', 
            transactionId: result.insertedId,
            processedAt: new Date()
          } 
        }
      )
    }
    
    return NextResponse.json({
      success: true,
      transaction: {
        ...transaction,
        id: result.insertedId
      }
    })
  } catch (error) {
    console.error('Error creating transaction:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create transaction' },
      { status: 500 }
    )
  }
} 