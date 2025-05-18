import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose, { Types } from 'mongoose'
import Product from '@/lib/models/Product'
import TransactionModel, { ISaleTransaction } from '@/lib/models/transaction'

// Define interfaces for calculation results
interface ProfitItem {
  productId: Types.ObjectId;
  quantity: number;
  itemName: string;
  costBasis: number;
  totalCost: number;
  totalPrice: number;
  profit: number;
  profitMargin: number;
}

interface ProfitResult {
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  processingFees?: number;
  hasCostData: boolean;
  items: ProfitItem[];
}

// Simple type guard to check if transaction is a sale
function isSaleTransaction(transaction: unknown): boolean {
  return Boolean(
    transaction && 
    typeof transaction === 'object' && 
    transaction !== null &&
    'type' in transaction && 
    (transaction as { type: string }).type === 'sale' && 
    'products' in transaction && 
    Array.isArray((transaction as { products: unknown[] }).products)
  );
}

/**
 * GET handler for profit calculation
 */
export async function GET(request: NextRequest) {
  try {
    // Extract transaction ID from the URL
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const transactionId = pathSegments[pathSegments.length - 2]; // Get the ID segment from the path
    
    if (!transactionId || !mongoose.Types.ObjectId.isValid(transactionId)) {
      return NextResponse.json({ error: 'Invalid transaction ID' }, { status: 400 });
    }

    await connectToDatabase();
    const objectId = new mongoose.Types.ObjectId(transactionId);
    
    const persistResult = url.searchParams.get('persist') === 'true';

    // Get the transaction
    const transaction = await TransactionModel.findById(objectId).lean();

    // Check if it's a valid sale transaction
    if (!transaction || !isSaleTransaction(transaction)) {
      return NextResponse.json(
        { error: 'Transaction not found or not a sale' },
        { status: 404 }
      );
    }

    // Calculate profit
    const profitData = await calculateProfit(transaction as unknown as ISaleTransaction);

    // Optionally save the calculation to the transaction
    if (persistResult) {
      await TransactionModel.updateOne(
        { _id: objectId },
        { 
          $set: { 
            profitCalculation: {
              ...profitData,
              lastCalculatedAt: new Date()
            }
          }
        }
      );
    }

    return NextResponse.json({
      transactionId,
      persistResult,
      ...profitData
    });
  } catch (error) {
    console.error('Error calculating profit:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to calculate profit' },
      { status: 500 }
    );
  }
}

/**
 * POST handler for profit calculation
 */
export async function POST(request: NextRequest) {
  try {
    // Extract transaction ID from the URL
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const transactionId = pathSegments[pathSegments.length - 2]; // Get the ID segment from the path
    
    if (!transactionId || !mongoose.Types.ObjectId.isValid(transactionId)) {
      return NextResponse.json({ error: 'Invalid transaction ID' }, { status: 400 });
    }

    console.log('[API] Processing profit calculation for transaction:', transactionId);
    
    await connectToDatabase();
    const objectId = new mongoose.Types.ObjectId(transactionId);

    // Get the transaction
    const transaction = await TransactionModel.findById(objectId).lean();

    // Check if it's a valid sale transaction
    if (!transaction || !isSaleTransaction(transaction)) {
      console.error('[API] Transaction not found or not a sale:', transactionId);
      return NextResponse.json(
        { error: 'Transaction not found or not a sale' },
        { status: 404 }
      );
    }

    // Calculate profit
    const profitData = await calculateProfit(transaction as unknown as ISaleTransaction);
    console.log('[API] Calculated profit data to save:', {
      transactionId,
      totalCost: profitData.totalCost,
      totalProfit: profitData.totalProfit,
      hasCostData: profitData.hasCostData,
      itemsCount: profitData.items.length
    });

    // Create profit calculation update data with explicit values
    const profitCalculationUpdate = {
      lastCalculatedAt: new Date(),
      totalCost: profitData.totalCost,
      totalProfit: profitData.totalProfit,
      profitMargin: profitData.profitMargin,
      hasCostData: profitData.hasCostData,
      items: profitData.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        itemName: item.itemName,
        costBasis: item.costBasis,
        totalCost: item.totalCost,
        totalPrice: item.totalPrice,
        profit: item.profit,
        profitMargin: item.profitMargin
      }))
    };

    // Use direct MongoDB update to avoid Next.js issues
    const collection = mongoose.connection.collection('transactions');
    const updateResult = await collection.updateOne(
      { _id: objectId },
      { $set: { profitCalculation: profitCalculationUpdate } }
    );

    if (updateResult.modifiedCount === 0) {
      console.error('[API] Failed to update transaction:', transactionId);
      return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
    }

    // Fetch the updated document to return in response
    const updatedTransaction = await TransactionModel.findById(objectId).lean();
    
    // Type assertion for the updated document
    const typedUpdatedTransaction = updatedTransaction as unknown as {
      profitCalculation?: {
        totalProfit?: number;
        hasCostData?: boolean;
        items?: Array<unknown>;
      }
    };
    
    console.log('[API] Successfully saved profit calculation:', {
      transactionId,
      profitCalculation: typedUpdatedTransaction?.profitCalculation ? {
        totalProfit: typedUpdatedTransaction.profitCalculation.totalProfit,
        hasCostData: typedUpdatedTransaction.profitCalculation.hasCostData,
        itemCount: typedUpdatedTransaction.profitCalculation.items?.length || 0
      } : 'Missing'
    });

    return NextResponse.json({
      success: true,
      transactionId,
      profitCalculation: profitCalculationUpdate // Return the data we just saved
    });
  } catch (error) {
    console.error('[API] Error saving profit calculation:', {
      error: error instanceof Error ? error.message : error
    });
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save profit calculation' },
      { status: 500 }
    );
  }
}

/**
 * Helper function to calculate profit for a transaction
 */
async function calculateProfit(transaction: ISaleTransaction): Promise<ProfitResult> {
  console.log('[API] Starting profit calculation for transaction:', {
    id: transaction._id,
    type: transaction.type,
    productsCount: transaction.products?.length || 0
  });
  
  // Initialize result structure
  const result: ProfitResult = {
    totalCost: 0,
    totalProfit: 0,
    profitMargin: 0,
    hasCostData: false,
    items: []
  }

  if (!transaction.products || !Array.isArray(transaction.products) || transaction.products.length === 0) {
    console.log('[API] No products found in transaction');
    return result;
  }

  // Detailed log of transaction products
  console.log('[API] Transaction products:', JSON.stringify(transaction.products.map(p => ({
    productId: p.productId,
    productIdType: typeof p.productId,
    name: p.name,
    quantity: p.quantity,
    totalPrice: p.totalPrice
  }))));

  // Get all product IDs from the transaction
  const productIds = transaction.products
    .map(item => item.productId)
    .filter(id => id); // Filter out any undefined/null IDs

  console.log('[API] Extracted productIds:', productIds);
  console.log('[API] ProductId types:', productIds.map(id => typeof id));

  if (productIds.length === 0) {
    console.log('[API] No valid productIds found after filtering');
    return result;
  }

  // Convert string IDs to ObjectId if needed
  const objectIdProductIds = productIds.map(id => {
    if (typeof id === 'string') {
      try {
        const objectId = new mongoose.Types.ObjectId(id);
        console.log(`[API] Converted string ID (${id}) to ObjectId: ${objectId}`);
        return objectId;
      } catch {
        console.error(`[API] Invalid product ID format: ${id}`);
        return null;
      }
    }
    console.log(`[API] ID is already an ObjectId: ${id}`);
    return id;
  }).filter(Boolean); // Remove null values
  
  console.log('[API] Product IDs for lookup:', objectIdProductIds);
  console.log('[API] ObjectId count after conversion:', objectIdProductIds.length);
  
  // Fetch all products in one query
  console.log('[API] Querying products with _id $in objectIdProductIds (count: ' + objectIdProductIds.length + ')');
  
  const productDocs = await Product.find({
    _id: { $in: objectIdProductIds }
  }).lean();

  console.log('[API] Found products count:', productDocs.length);
  console.log('[API] Found product details:', productDocs.map(p => ({
    id: p._id,
    name: p.name,
    averageCost: p.averageCost,
    sku: p.sku
  })));

  // Type assertion for product data
  const products = productDocs as unknown as Array<{
    _id: mongoose.Types.ObjectId;
    name?: string;
    averageCost?: number;
  }>;

  // Create a map for easier lookup
  const productMap = new Map<string, { name?: string, averageCost?: number }>();
  for (const product of products) {
    if (product._id) {
      const idString = product._id.toString();
      productMap.set(idString, product);
      console.log(`[API] Added product to map with key: ${idString}, averageCost: ${product.averageCost}, name: ${product.name}`);
    }
  }
  console.log('[API] Product map size:', productMap.size);
  console.log('[API] Product map keys:', Array.from(productMap.keys()));

  // Calculate costs and profits for each item
  let hasValidCostData = false;
  let totalCost = 0;
  const totalRevenue = transaction.preTaxAmount || 0;
  console.log('[API] Total revenue (preTaxAmount):', totalRevenue);

  const items = transaction.products.map((item, index) => {
    // Convert productId to string for map lookup if it's not already a string
    const productId = typeof item.productId === 'string' 
      ? item.productId 
      : item.productId?.toString();
    
    console.log(`[API] Processing item ${index}:`, {
      name: item.name,
      productId: productId,
      productIdType: typeof item.productId,
      quantity: item.quantity,
      totalPrice: item.totalPrice
    });
    
    const product = productId ? productMap.get(productId) : null;
    
    console.log(`[API] Product lookup result for ${productId}:`, product ? {
      found: true,
      averageCost: product.averageCost,
      hasCost: product && typeof product.averageCost === 'number' && product.averageCost > 0
    } : 'Not found');
    
    // Set default values
    const itemResult: ProfitItem = {
      productId: item.productId as Types.ObjectId,
      quantity: item.quantity || 0,
      itemName: item.name || 'Unknown Product',
      costBasis: 0,
      totalCost: 0,
      totalPrice: item.totalPrice || 0,
      profit: 0,
      profitMargin: 0
    };

    // If product exists and has cost data
    if (product && typeof product.averageCost === 'number' && product.averageCost > 0) {
      itemResult.costBasis = product.averageCost;
      itemResult.totalCost = product.averageCost * itemResult.quantity;
      itemResult.profit = itemResult.totalPrice - itemResult.totalCost;
      
      // Calculate profit margin (protection against division by zero)
      if (itemResult.totalPrice > 0) {
        itemResult.profitMargin = (itemResult.profit / itemResult.totalPrice) * 100;
      }
      
      totalCost += itemResult.totalCost;
      hasValidCostData = true;
      
      console.log(`[API] Successfully calculated profit for item ${index}:`, {
        itemName: itemResult.itemName,
        costBasis: itemResult.costBasis,
        totalCost: itemResult.totalCost,
        totalPrice: itemResult.totalPrice,
        profit: itemResult.profit,
        profitMargin: itemResult.profitMargin
      });
    } else {
      console.log(`[API] Unable to calculate profit for item ${index}:`, {
        reason: !product ? 'Product not found' : 'Invalid or missing averageCost',
        productId: productId,
        productFound: !!product,
        averageCost: product?.averageCost
      });
    }

    return itemResult;
  });

  // Calculate fees (if any)
  let processingFees = 0;
  if (transaction.paymentProcessing && typeof transaction.paymentProcessing.fee === 'number') {
    processingFees = transaction.paymentProcessing.fee;
    console.log('[API] Processing fees:', processingFees);
  }

  // Calculate total profit
  const totalProfit = totalRevenue - totalCost - processingFees;
  
  // Calculate overall profit margin
  let profitMargin = 0;
  if (totalRevenue > 0) {
    profitMargin = (totalProfit / totalRevenue) * 100;
  }

  console.log('[API] Final calculation results:', {
    totalCost,
    totalProfit,
    profitMargin,
    processingFees,
    hasCostData: hasValidCostData,
    itemsCount: items.length
  });

  return {
    totalCost,
    totalProfit,
    profitMargin,
    processingFees,
    hasCostData: hasValidCostData,
    items
  };
} 