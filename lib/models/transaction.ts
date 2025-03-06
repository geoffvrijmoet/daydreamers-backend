import { ObjectId } from 'mongodb';

/**
 * MongoDB Transaction Schema
 * 
 * This represents the structure of transactions stored in MongoDB.
 * The schema closely follows the Transaction interface from the types directory
 * but provides more detailed documentation and validation rules.
 */

export interface TransactionSchema {
  /**
   * MongoDB document ID
   */
  _id: ObjectId;
  
  /**
   * Unique transaction ID, typically includes source prefix
   * Examples: "square_AbC123", "shopify_1234", "manual_20230101_1"
   */
  id: string;
  
  /**
   * Transaction date in YYYY-MM-DD format
   */
  date: string;
  
  /**
   * Transaction type
   */
  type: 'sale' | 'purchase' | 'refund';
  
  /**
   * Transaction amount in dollars
   */
  amount: number;
  
  /**
   * Transaction description
   */
  description: string;
  
  /**
   * Source of the transaction
   * - 'square': Imported from Square
   * - 'shopify': Imported from Shopify
   * - 'gmail': Extracted from email
   * - 'manual': Manually entered or imported from Excel
   */
  source: 'square' | 'shopify' | 'gmail' | 'manual';
  
  /**
   * Customer name
   */
  customer?: string;
  
  /**
   * Payment method used
   * Common values: "Cash", "Credit Card", "Square", "Shopify", "Venmo", "Zelle", "Cash App"
   */
  paymentMethod?: string;
  
  /**
   * Line items from point of sale system
   */
  lineItems?: Array<{
    name: string;
    quantity: number;
    price: number;
    sku?: string;
    variant_id?: string;
  }>;
  
  /**
   * Products associated with this transaction
   */
  products?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    productId?: string;
  }>;
  
  /**
   * Total of all products
   */
  productsTotal?: number;
  
  /**
   * Tax amount in dollars
   */
  taxAmount?: number;
  
  /**
   * Amount before tax
   */
  preTaxAmount?: number;
  
  /**
   * Tip amount in dollars
   */
  tip?: number;
  
  /**
   * Discount amount in dollars
   */
  discount?: number;
  
  /**
   * Transaction status
   */
  status: 'completed' | 'cancelled' | 'refunded';
  
  /**
   * Refund information if applicable
   */
  refundAmount?: number;
  refundDate?: string;
  
  /**
   * Void information if applicable
   */
  voidReason?: string;
  voidedAt?: string;
  
  /**
   * Supplier information for purchases
   */
  supplier?: string;
  supplierOrderNumber?: string;
  
  /**
   * Additional notes
   */
  notes?: string;
  
  /**
   * Timestamps
   */
  createdAt: string;
  updatedAt: string;
  
  /**
   * Profit calculation data
   */
  profitCalculation?: {
    /**
     * Whether cost data is available for this transaction
     */
    hasCostData: boolean;
    
    /**
     * Item-by-item cost and profit breakdown
     */
    items?: Array<{
      name: string;
      quantity: number;
      salesPrice: number;
      cost: number;
      profit: number;
      profitMargin?: number;
    }>;
    
    /**
     * Total revenue from this transaction
     */
    totalRevenue: number;
    
    /**
     * Total cost of all items in this transaction
     */
    totalCost: number;
    
    /**
     * Total profit (totalRevenue - totalCost - creditCardFees)
     */
    totalProfit: number;
    
    /**
     * Number of items without cost data
     */
    itemsWithoutCost: number;
    
    /**
     * Credit card processing fees
     */
    creditCardFees: number;
    
    /**
     * When the profit calculation was performed
     */
    calculatedAt: string;
  };
  
  /**
   * Shopify-specific fields
   */
  shopifyOrderId?: string;
  shopifyTotalTax?: number;
  shopifySubtotalPrice?: number;
  shopifyTotalPrice?: number;
  shopifyProcessingFee?: number;
  shopifyPaymentGateway?: string;
  
  /**
   * Additional Excel-imported fields
   * These are extra fields that may be included when importing from Excel
   */
  location?: string;
  dogTrainingAgency?: string;
  dogName?: string;
  itemizedWholesaleSpend?: string;
  state?: string;
  startingCashBalance?: number;
  endingCashBalance?: number;
  wholesaleCost?: number;
  softwareCost?: number;
  adsCost?: number;
  equipmentCost?: number;
  miscellaneousExpense?: number;
  printMediaExpense?: number;
  shippingCost?: number;
  transitCost?: number;
  dryIceCost?: number;
  packagingCost?: number;
  spaceRentalCost?: number;
  fee?: number;
  pawsabilityRent?: number;
  otherCost?: number;
  paidToMadeline?: number;
  paidToGeoff?: number;
  actuallySentToMadeline?: number;
  withheldForMadelineIncomeTax?: number;
  actuallySentToGeoff?: number;
  withheldForGeoffIncomeTax?: number;
  investmentFromMadeline?: number;
  investmentFromGeoff?: number;
  revenue?: number;
  estimatedWholesaleCost?: number;
  estimatedProfit?: number;
  estimatedProfitPercentage?: number;
  estimatedItemizedProfit?: string;
  
  /**
   * Original Excel Transaction ID
   * Used for tracking and preventing duplicate imports of Venmo, Cash App, and Cash transactions
   */
  excelId?: string;
}

/**
 * Helper functions for working with transactions
 */

/**
 * Formats a date as YYYY-MM-DD for MongoDB storage
 */
export function formatTransactionDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

/**
 * Determines the appropriate source value based on payment method
 */
export function determineTransactionSource(paymentMethod: string): 'square' | 'shopify' | 'manual' {
  if (paymentMethod === 'Square') return 'square';
  if (paymentMethod === 'Shopify') return 'shopify';
  return 'manual'; // Cash, Venmo, Zelle, Cash App, etc. are all 'manual'
}

/**
 * Creates a unique ID for a transaction based on source and existing ID
 */
export function createTransactionId(source: string, existingId?: string): string {
  if (!existingId) {
    // Generate a timestamp-based ID if none exists
    const timestamp = new Date().getTime();
    const random = Math.floor(Math.random() * 1000);
    return `${source}_${timestamp}_${random}`;
  }
  
  // For existing IDs, prefix with source if not already prefixed
  if (existingId.startsWith(`${source}_`)) return existingId;
  return `${source}_${existingId}`;
} 