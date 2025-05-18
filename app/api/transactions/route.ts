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
    console.log('Server: /api/transactions POST: Received body:', body); // Log the whole body

    const { 
      date, 
      amount, 
      // merchant, // Will get this from body if type is 'expense' or from customer if 'sale'
      // description, // Notes will be used as description
      type = 'expense', 
      source = 'manual',
      cardLast4, 
      emailId,
      products, // Array of product data
      // Fields specific to SaleFormData
      customer,
      paymentMethod,
      isTaxable,
      preTaxAmount,
      taxAmount,
      tip,
      discount,
      shipping,
      notes, // This will be our description
      // Fields specific to ExpenseFormData
      category, // Renamed to purchaseCategory
      supplier, // Renamed to merchant
      supplierOrderNumber,
      // Fields specific to TrainingFormData
      trainer,
      clientName,
      dogName,
      sessionNotes, // Could also be part of notes
      revenue,
      trainingAgency
    } = body
    
    // Base transaction object
    let transactionToSave: any = {
      date: new Date(date),
      amount: parseFloat(amount),
      type,
      source,
      notes: notes || sessionNotes || '', // Use notes as description, fallback to sessionNotes
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (cardLast4) transactionToSave.cardLast4 = cardLast4;
    if (emailId) transactionToSave.emailId = emailId;

    // Handle different transaction types
    if (type === 'sale') {
      transactionToSave = {
        ...transactionToSave,
        customer: customer || clientName || '', // Use customer, fallback to clientName for training sales
        paymentMethod,
        isTaxable,
        preTaxAmount: parseFloat(preTaxAmount) || 0,
        taxAmount: parseFloat(taxAmount) || 0,
        tip: parseFloat(tip) || 0,
        discount: parseFloat(discount) || 0,
        shipping: parseFloat(shipping) || 0,
        products: products && Array.isArray(products) ? products.map(p => ({ ...p })) : [], // Ensure products is an array
      };
      console.log('Server: /api/transactions POST: Sale transaction to save (preTaxAmount):', transactionToSave.preTaxAmount);
      console.log('Server: /api/transactions POST: Sale transaction to save (taxAmount):', transactionToSave.taxAmount);
    } else if (type === 'expense') {
      transactionToSave = {
        ...transactionToSave,
        merchant: supplier || '', // Use supplier as merchant for expenses
        purchaseCategory: category || '',
        supplierOrderNumber: supplierOrderNumber || '',
        products: products && Array.isArray(products) ? products.map(p => ({ ...p })) : [],
      };
    } else if (type === 'training') {
      transactionToSave = {
        ...transactionToSave,
        trainer,
        clientName, // Already captured in customer for sale type if applicable
        dogName,
        // sessionNotes is already in transactionToSave.notes
        revenue: parseFloat(revenue) || parseFloat(amount), // Use revenue or amount
        trainingAgency,
      };
    } else {
      // For generic types or if type is not 'sale', 'expense', or 'training'
      // We might want to add a generic merchant or description if not covered
      transactionToSave.merchant = body.merchant || '';
      transactionToSave.description = body.description || transactionToSave.notes || '';
    }
        
    console.log('Server: /api/transactions POST: Transaction object before saving:', transactionToSave);
    const result = await mongoose.connection.db!.collection('transactions').insertOne(transactionToSave)
    
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
        ...transactionToSave,
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