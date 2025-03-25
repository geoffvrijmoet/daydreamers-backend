import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

// Define types for profit calculation
interface ProfitCalculationItem {
  name: string;
  quantity: number;
  salePrice: number;
  itemCost: number;
  itemProfit: number;
  hasCostData: boolean;
}

// Used for the request body
interface ProfitRequest {
  profitDetails: {
    lineItemProfits?: ProfitCalculationItem[];
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    itemsWithoutCost: number;
    creditCardFees: number;
  };
  taxDetails: {
    taxAmount: number;
    preTaxAmount: number;
  };
  calculatedAt: string;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    console.log('[API] Received profit calculation save request for transaction:', params.id);
    
    await connectToDatabase()
    const { profitDetails, taxDetails, calculatedAt }: ProfitRequest = await request.json()
    
    console.log('[API] Profit calculation data:', {
      transactionId: params.id,
      calculatedAt,
      totalProfit: profitDetails.totalProfit,
      totalCost: profitDetails.totalCost,
      totalRevenue: profitDetails.totalRevenue,
      itemCount: profitDetails.lineItemProfits?.length || 0,
      itemsWithoutCost: profitDetails.itemsWithoutCost,
      creditCardFees: profitDetails.creditCardFees,
      taxAmount: taxDetails.taxAmount,
      preTaxAmount: taxDetails.preTaxAmount
    });

    // Format the profit calculation to match our schema
    const profitCalculation = {
      hasCostData: profitDetails.lineItemProfits?.some((item: ProfitCalculationItem) => item.hasCostData) || false,
      items: profitDetails.lineItemProfits?.map((item: ProfitCalculationItem) => ({
        name: item.name,
        quantity: item.quantity,
        salesPrice: item.salePrice,
        cost: item.itemCost,
        profit: item.itemProfit,
        profitMargin: item.itemProfit / (item.salePrice * item.quantity),
      })),
      totalRevenue: profitDetails.totalRevenue,
      totalCost: profitDetails.totalCost,
      totalProfit: profitDetails.totalProfit,
      itemsWithoutCost: profitDetails.itemsWithoutCost,
      creditCardFees: profitDetails.creditCardFees,
      calculatedAt
    };

    // Update the transaction with profit details and tax calculation
    const result = await mongoose.model('Transaction').findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(params.id) },
      {
        $set: {
          profitCalculation,
          taxAmount: taxDetails.taxAmount,
          preTaxAmount: taxDetails.preTaxAmount,
          updatedAt: new Date().toISOString()
        }
      },
      { new: true }
    )

    if (!result) {
      console.error('[API] Transaction not found:', params.id);
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      )
    }

    console.log('[API] Successfully saved profit calculation:', {
      transactionId: params.id,
      updatedAt: result.updatedAt,
      hasCostData: result.profitCalculation?.hasCostData,
      totalProfit: result.profitCalculation?.totalProfit,
      itemCount: result.profitCalculation?.items?.length || 0
    });

    return NextResponse.json(result)
  } catch (error) {
    console.error('[API] Error saving profit calculation:', {
      transactionId: params.id,
      error: error instanceof Error ? error.message : error
    });
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save profit calculation' },
      { status: 500 }
    )
  }
} 