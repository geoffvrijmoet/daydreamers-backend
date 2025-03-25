import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import mongoose from 'mongoose';

interface AmexTransaction {
  date: string;
  amount: number;
  reference?: string;
  description?: string;
  category?: string;
  cardNumber?: string;
  [key: string]: unknown;
}

interface MatchedTransaction {
  reference?: string;
  match: {
    id?: string;
    _id: mongoose.Types.ObjectId | string;
    date: string;
    amount: number;
    type: string;
    description?: string;
  };
}

// Helper function to determine transaction type based on description and category
// Note: This is kept for logging purposes only, we'll always use "purchase" for MongoDB queries
function determineTransactionType(transaction: AmexTransaction): 'purchase' | 'sale' {
  const { amount, description, category } = transaction;
  
  // Keywords that indicate this is a purchase/expense regardless of amount sign
  const purchaseKeywords = [
    'fee', 'fees', 'payment fee', 'return payment', 'interest', 'adjustment',
    'charge', 'service charge', 'annual fee', 'membership fee'
  ];
  
  // Check description and category for purchase keywords
  if (description || category) {
    const combinedText = `${description || ''} ${category || ''}`.toLowerCase();
    
    if (purchaseKeywords.some(keyword => combinedText.includes(keyword.toLowerCase()))) {
      return 'purchase';
    }
  }
  
  // If no keyword matches, use the amount sign as fallback
  return amount < 0 ? 'purchase' : 'sale';
}

export async function POST(request: Request) {
  try {
    const { transactions } = await request.json() as { transactions: AmexTransaction[] };
    
    if (!Array.isArray(transactions)) {
      return NextResponse.json(
        { success: false, message: "Invalid request: transactions must be an array" },
        { status: 400 }
      );
    }
    
    await connectToDatabase();
    const existingTransactions: MatchedTransaction[] = [];
    
    // Add logging for debugging
    if (transactions.length > 0) {
      const firstTransaction = transactions[0];
      console.log('================================');
      console.log('DEBUG: First AMEX transaction details:');
      console.log({
        date: firstTransaction.date,
        amount: firstTransaction.amount,
        description: firstTransaction.description,
        category: firstTransaction.category,
        reference: firstTransaction.reference,
        cardNumber: firstTransaction.cardNumber
      });
    }
    
    for (const transaction of transactions) {
      const { date, amount } = transaction;
      
      if (!date || amount === undefined) continue;
      
      // Parse the date from the AMEX transaction format to create a date range
      const transactionDate = new Date(date);
      
      // Set start of day (midnight)
      const startDate = new Date(transactionDate);
      startDate.setUTCHours(0, 0, 0, 0);
      
      // Set end of day (23:59:59.999)
      const endDate = new Date(transactionDate);
      endDate.setUTCHours(23, 59, 59, 999);
      
      // Get what would have been determined, for logging purposes only
      const determinedType = determineTransactionType(transaction);
      
      // Debug log for the first transaction search
      if (transaction === transactions[0]) {
        console.log('DEBUG: Searching MongoDB for first transaction');
        console.log({
          dateRange: {
            original: date,
            parsed: transactionDate.toISOString(),
            start: startDate.toISOString(),
            end: endDate.toISOString()
          },
          amount: Math.abs(amount),
          lookingForType: 'purchase',  // Always looking for purchase type
          determinedTypeForInfo: determinedType,
          note: 'Searching only for purchase type transactions as requested'
        });
      }
      
      // Find transactions with matching amount and date
      // ALWAYS use "purchase" as the type
      const foundTransactions = await mongoose.model('Transaction').find({
        amount: Math.abs(amount), // MongoDB stores positive amounts
        type: 'purchase',  // Always search for purchases
        date: {
          $gte: startDate.toISOString(),
          $lte: endDate.toISOString()
        }
      });
      
      // Log matched transactions for the first AMEX transaction
      if (transaction === transactions[0]) {
        console.log(`DEBUG: Found ${foundTransactions.length} matching transactions in MongoDB`);
        
        if (foundTransactions.length > 0) {
          console.log('DEBUG: First matching MongoDB transaction:');
          console.log({
            id: foundTransactions[0].id,
            _id: foundTransactions[0]._id,
            date: foundTransactions[0].date,
            amount: foundTransactions[0].amount,
            type: foundTransactions[0].type,
            description: foundTransactions[0].description || foundTransactions[0].vendor || foundTransactions[0].customer
          });
        }
        
        console.log('================================');
      }
      
      if (foundTransactions.length > 0) {
        // Add each matching transaction to the results
        foundTransactions.forEach(match => {
          existingTransactions.push({
            reference: transaction.reference,
            match: {
              id: match.id,
              _id: match._id,
              date: match.date,
              amount: match.amount,
              type: match.type,
              description: match.description || match.vendor || match.customer
            }
          });
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      existingCount: existingTransactions.length,
      existingTransactions
    });
    
  } catch (error) {
    console.error("Error checking for existing transactions:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : "An unknown error occurred" 
      }, 
      { status: 500 }
    );
  }
} 