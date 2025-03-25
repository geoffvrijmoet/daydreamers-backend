import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { connectToDatabase } from "@/lib/mongoose";
import mongoose from 'mongoose';

// Define a type that matches the MongoDB Transaction document structure
type CustomDocument = {
  date: Date | string;
  amount: number;
  type: string;
  paymentMethod?: string;
  customer?: string;
  vendor?: string;
  supplierOrderNumber?: string;
  products?: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

interface Transaction {
  id?: string;
  date: string;
  description: string;
  amount: number;
  reference?: string;
  category?: string;
  cardNumber?: string;
  source?: string;
  _customDocument?: CustomDocument;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactions, isCommit = false, useCustomDocument = false } = body;

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { message: "Invalid request data" },
        { status: 400 }
      );
    }

    if (isCommit) {
      const results = await processTransactions(transactions, useCustomDocument);
      return NextResponse.json(results);
    } else {
      // Just return the transactions for preview
      return NextResponse.json({
        message: "Transactions received for preview",
        count: transactions.length,
        transactions,
      });
    }
  } catch (error) {
    console.error("Error processing AMEX transactions:", error);
    return NextResponse.json(
      {
        message: "Error processing transactions",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function processTransactions(
  transactions: Transaction[],
  useCustomDocument: boolean
) {
  const importedIds: string[] = [];
  const errors: Array<{
    transaction: Transaction;
    error: string;
  }> = [];
  
  try {
    await connectToDatabase();
    
    for (const transaction of transactions) {
      try {
        if (useCustomDocument && transaction._customDocument) {
          // Use the custom document directly
          console.log(`Using custom document for transaction: ${transaction.description}`);
          
          // Extract the custom document and ensure date is properly handled
          const customDoc = { ...transaction._customDocument };
          
          // Ensure date is a Date object
          if (typeof customDoc.date === 'string') {
            customDoc.date = new Date(customDoc.date);
          }
          
          // Add timestamp fields if not present
          const now = new Date();
          if (!customDoc.createdAt) {
            customDoc.createdAt = now.toISOString();
          }
          if (!customDoc.updatedAt) {
            customDoc.updatedAt = now.toISOString();
          }
          
          // Create the transaction directly in MongoDB
          const result = await mongoose.model('Transaction').create(customDoc);
          
          importedIds.push(result._id.toString());
          console.log(`Created transaction with ID: ${result._id}`);
        } else {
          // Original transaction processing logic
          // Generate reference if not available
          const reference = transaction.reference || `AMEX-${format(new Date(transaction.date), "yyyyMMdd")}-${Math.floor(Math.random() * 10000)}`;
          
          // Check if transaction already exists
          const existingTransaction = await mongoose.model('Transaction').findOne({
            date: new Date(transaction.date),
            amount: Math.abs(transaction.amount),
            type: transaction.amount < 0 ? "purchase" : "sale",
          });
          
          if (existingTransaction) {
            console.log(`Transaction already exists: ${existingTransaction._id}`);
            importedIds.push(existingTransaction._id.toString());
            continue;
          }
          
          // Determine transaction type
          const transactionType = transaction.amount < 0 ? "purchase" : "sale";
          
          // Log transaction metadata for debugging
          console.log(`Importing transaction: ${transaction.description} (${transactionType})`);
          if (transaction.category) console.log(`Category: ${transaction.category}`);
          if (transaction.reference) console.log(`Reference: ${transaction.reference}`);
          if (transaction.cardNumber) console.log(`Card: ${transaction.cardNumber}`);
          
          // Create transaction with MongoDB
          const now = new Date();
          const newTransaction = {
            date: new Date(transaction.date),
            amount: Math.abs(transaction.amount),
            type: transactionType,
            paymentMethod: "AMEX",
            ...(transactionType === "purchase"
              ? { vendor: transaction.description }
              : { customer: transaction.description }),
            supplierOrderNumber: reference,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
          };
          
          const result = await mongoose.model('Transaction').create(newTransaction);
          
          importedIds.push(result._id.toString());
          console.log(`Created transaction with ID: ${result._id}`);
        }
      } catch (err) {
        console.error("Error processing individual transaction:", err);
        errors.push({
          transaction,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
    
    return {
      message: "Transactions processed",
      count: importedIds.length,
      importedIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error("Error in batch processing:", error);
    throw error;
  }
} 