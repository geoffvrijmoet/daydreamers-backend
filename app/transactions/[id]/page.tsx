'use client'

import { useEffect, useState } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Calculator, Save } from "lucide-react"
import { useRouter } from 'next/navigation'
import { cn } from "@/lib/utils"

interface TransactionDetails {
  _id: string
  id: string
  description: string
  amount: number
  type: 'sale' | 'purchase'
  source?: 'square' | 'shopify' | 'gmail' | 'manual' | 'venmo'
  customer?: string
  paymentMethod?: string
  date: string
  products?: Array<ManualProduct>
  lineItems?: Array<LineItem>
  line_items?: Array<LineItem>
  productsTotal?: number
  taxAmount: number
  preTaxAmount?: number
  totalAmount: number
  tip?: number
  discount?: number
  status: 'completed' | 'cancelled' | 'refunded'
  voidReason?: string
  voidedAt?: string
  supplier?: string
  supplierOrderNumber?: string
  notes?: string
  profitCalculation?: TransactionProfitDetails
  // Shopify specific fields
  shopifyOrderId?: string
  shopifyTotalTax?: number
  shopifySubtotalPrice?: number
  shopifyTotalPrice?: number
  shopifyProcessingFee?: number
  shopifyPaymentGateway?: string
}

interface LineItem {
  name: string
  quantity: number
  price: number
  grossSalesMoney: {
    amount: number
  }
  variationName?: string
  sku?: string
  variant_id?: string
  mongoProduct?: {
    _id: string
    name: string
    sku: string
    retailPrice: number
    currentStock: number
    lastPurchasePrice: number
    averageCost: number
  }
}

interface ProfitCalculation {
  itemProfit: number
  itemCost: number
  quantity: number
  salePrice: number
  name: string
  hasCostData: boolean
}

interface TransactionProfitDetails {
  lineItemProfits: ProfitCalculation[]
  totalProfit: number
  totalCost: number
  totalRevenue: number
  itemsWithoutCost: number
  creditCardFees: number
}

interface ManualProduct {
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
  productId?: string
  mongoProduct?: {
    _id: string
    name: string
    sku: string
    retailPrice: number
    currentStock: number
    lastPurchasePrice: number
    averageCost: number
  }
}

export default function TransactionPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [transaction, setTransaction] = useState<TransactionDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profitDetails, setProfitDetails] = useState<TransactionProfitDetails | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingProfit, setSavingProfit] = useState(false)
  const [profitError, setProfitError] = useState<string | null>(null)
  const [fetchingFees, setFetchingFees] = useState(false)

  // Move these calculations into the component scope
  const taxAmount = transaction?.taxAmount ?? 0;
  const isVenmoTransaction = transaction?.source === 'venmo' || transaction?.paymentMethod === 'Venmo';
  const creditCardFees = isVenmoTransaction ? 0 : 
    transaction?.source === 'shopify' && transaction?.shopifyProcessingFee ? 
      transaction.shopifyProcessingFee : 
      0; // Only use actual fees from platforms

  const refetchShopifyFees = async () => {
    if (!transaction || transaction.source !== 'shopify') return;

    try {
      setFetchingFees(true);
      
      // Get Shopify order ID from either shopifyOrderId field or extract from id field
      const shopifyOrderId = transaction.shopifyOrderId || 
        (transaction.id.startsWith('shopify_') ? transaction.id.replace('shopify_', '') : null);

      console.log('[Refetch Fees] Starting fee fetch:', {
        transactionId: transaction._id,
        transactionInternalId: transaction.id,
        shopifyOrderId,
        hasShopifyOrderId: !!transaction.shopifyOrderId,
        extractedFromId: transaction.id.startsWith('shopify_')
      });

      if (!shopifyOrderId) {
        throw new Error('No Shopify order ID found for this transaction');
      }

      const url = `/api/transactions/${transaction._id}/shopify-fees`;
      console.log('[Refetch Fees] Making request to:', url);

      const response = await fetch(url, {
        method: 'POST'
      });

      console.log('[Refetch Fees] Response received:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch Shopify fees');
      }

      const data = await response.json();
      console.log('[Refetch Fees] Success:', {
        processingFee: data.processingFee,
        updatedTransaction: data.transaction
      });

      setTransaction(data.transaction);
      alert(`Successfully updated Shopify processing fee: $${data.processingFee.toFixed(2)}`);
    } catch (err) {
      console.error('[Shopify Fees] Error:', err);
      alert(err instanceof Error ? err.message : 'Failed to fetch Shopify fees');
    } finally {
      setFetchingFees(false);
    }
  };

  useEffect(() => {
    const fetchTransaction = async () => {
      try {
        console.log('[Transaction Load] Fetching transaction:', params.id);
        const response = await fetch(`/api/transactions/${params.id}`)
        if (!response.ok) {
          throw new Error('Failed to fetch transaction')
        }
        const data = await response.json()

        // Normalize line items to always use lineItems key
        if (data.line_items && !data.lineItems) {
          data.lineItems = data.line_items;
          delete data.line_items;
        }

        console.log('[Transaction Load] Received transaction data:', {
          id: data._id,
          source: data.source,
          amount: data.amount,
          lineItems: data.lineItems?.length ?? 0,
          products: data.products?.length ?? 0,
          hasProfitCalculation: !!data.profitCalculation
        });

        // If it's a manual transaction, fetch MongoDB products for all products
        if (data.source === 'manual' && data.products?.length > 0) {
          console.log('[Transaction Load] Fetching MongoDB products for manual transaction products');
          const updatedProducts = await Promise.all(
            data.products.map(async (product: ManualProduct) => {
              if (!product.productId) {
                console.log(`[Transaction Load] No productId for ${product.name}`);
                return product;
              }
              
              try {
                const productResponse = await fetch(`/api/products/${product.productId}`);
                const productData = await productResponse.json();
                
                if (productData) {
                  console.log(`[Transaction Load] Found MongoDB product for ${product.name}:`, {
                    name: productData.name,
                    sku: productData.sku,
                    averageCost: productData.averageCost
                  });
                  return { ...product, mongoProduct: productData };
                }
              } catch (err) {
                console.error(`[Transaction Load] Error fetching MongoDB product for ${product.name}:`, err);
              }
              
              return product;
            })
          );

          data.products = updatedProducts;
        }
        // If it's a Shopify transaction, fetch MongoDB products for all line items
        else if (data.source === 'shopify' && data.lineItems?.length > 0) {
          console.log('[Transaction Load] Fetching MongoDB products for line items');
          const updatedLineItems = await Promise.all(
            data.lineItems!.map(async (item: LineItem) => {
              if (!item.variant_id) return item;
              
              try {
                const productResponse = await fetch(`/api/products/shopify/find-by-variant?variantId=${item.variant_id}`);
                const productData = await productResponse.json();
                
                if (productData.product) {
                  console.log(`[Transaction Load] Found MongoDB product for ${item.name}:`, {
                    name: productData.product.name,
                    sku: productData.product.sku,
                    averageCost: productData.product.averageCost
                  });
                  return { ...item, mongoProduct: productData.product };
                }
              } catch (err) {
                console.error(`[Transaction Load] Error fetching MongoDB product for ${item.name}:`, err);
              }
              
              return item;
            })
          );

          data.lineItems = updatedLineItems;
        }

        setTransaction(data);

        // If transaction has existing profit calculation, set it
        if (data.profitCalculation) {
          console.log('[Transaction Load] Found existing profit calculation:', {
            totalProfit: data.profitCalculation.totalProfit,
            totalCost: data.profitCalculation.totalCost,
            totalRevenue: data.profitCalculation.totalRevenue,
            calculatedAt: data.profitCalculation.calculatedAt
          });
          setProfitDetails(data.profitCalculation);
        }
      } catch (err) {
        console.error('[Transaction Load] Error:', err);
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchTransaction()
  }, [params.id])

  const calculateProfit = () => {
    console.log('Calculating profit for transaction:', transaction);
    if (!transaction) {
      console.log('No transaction data available');
      return;
    }

    const TAX_RATE = 0.08875;
    let preTaxAmount, calculatedTax;
    
    // For Shopify orders, use the actual tax amount from Shopify
    if (transaction.source === 'shopify') {
      // Use the actual tax amount from Shopify
      calculatedTax = transaction.taxAmount;
      preTaxAmount = transaction.preTaxAmount ?? (transaction.amount - (transaction.taxAmount ?? 0) - (transaction.tip ?? 0));
      
      console.log('[Profit Calc] Using Shopify tax data:', {
        taxAmount: calculatedTax,
        preTaxAmount: preTaxAmount,
        totalAmount: transaction.amount
      });
    } else {
      // For non-Shopify orders, calculate tax from total
      const totalWithoutTip = transaction.amount - (transaction.tip ?? 0);
      preTaxAmount = totalWithoutTip / (1 + TAX_RATE);
      calculatedTax = preTaxAmount * TAX_RATE;
    }
    
    // Check both source and paymentMethod for Venmo
    const isVenmoTransaction = transaction.source === 'venmo' || transaction.paymentMethod === 'Venmo';
    const creditCardFees = isVenmoTransaction ? 0 : 
      transaction.source === 'shopify' && transaction.shopifyProcessingFee ? 
        transaction.shopifyProcessingFee : 
        0; // Only use actual fees from platforms
    
    console.log('Transaction details:', {
      source: transaction.source,
      paymentMethod: transaction.paymentMethod,
      isVenmo: isVenmoTransaction,
      totalAmount: transaction.amount,
      preTaxAmount: preTaxAmount.toFixed(2),
      calculatedTax: calculatedTax.toFixed(2),
      tip: transaction.tip,
      creditCardFees: creditCardFees.toFixed(2),
      shopifyFees: transaction.shopifyProcessingFee
    });

    const profitDetails: TransactionProfitDetails = {
      lineItemProfits: [],
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0,
      itemsWithoutCost: 0,
      creditCardFees: 0
    };

    // Handle Shopify transactions
    if (transaction.source === 'shopify' && transaction.lineItems) {
      // Calculate what portion of the total each item represents
      const itemRevenues = transaction.lineItems.map(item => ({
        itemId: item.variant_id,
        revenue: Number(item.price) * item.quantity
      }));
      
      const totalItemRevenue = itemRevenues.reduce((sum, item) => sum + item.revenue, 0);

      transaction.lineItems.forEach((item, index) => {
        console.log(`[Profit Calc] Processing item ${index + 1}:`, {
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          mongoProduct: item.mongoProduct ? {
            id: item.mongoProduct._id,
            name: item.mongoProduct.name,
            averageCost: item.mongoProduct.averageCost
          } : 'No MongoDB product linked'
        });

        const salePrice = Number(item.price);
        const quantity = item.quantity;
        const revenue = salePrice * quantity;
        
        // Calculate this item's share of tax and fees based on its proportion of total revenue
        const revenueShare = revenue / totalItemRevenue;
        const itemTaxShare = calculatedTax * revenueShare;
        const itemFeesShare = creditCardFees * revenueShare;
        
        const calculation: ProfitCalculation = {
          name: item.name,
          salePrice,
          quantity,
          itemCost: 0,
          itemProfit: 0,
          hasCostData: false
        };

        if (item.mongoProduct?.averageCost) {
          const costPerUnit = item.mongoProduct.averageCost;
          const totalCost = costPerUnit * quantity;
          // Profit = Revenue - Cost - Item's share of tax and fees
          const profit = revenue - totalCost - itemTaxShare - itemFeesShare;

          console.log(`[Profit Calc] Item ${index + 1} profit calculation:`, {
            revenue,
            costPerUnit,
            totalCost,
            taxShare: itemTaxShare,
            feesShare: itemFeesShare,
            profit,
            margin: ((profit / revenue) * 100).toFixed(1) + '%'
          });

          calculation.itemCost = totalCost;
          calculation.itemProfit = profit;
          calculation.hasCostData = true;

          profitDetails.totalCost += totalCost;
          profitDetails.totalProfit += profit;
        } else {
          console.log(`[Profit Calc] Item ${index + 1} missing cost data`);
          profitDetails.itemsWithoutCost++;
        }

        profitDetails.totalRevenue += revenue;
        profitDetails.lineItemProfits.push(calculation);
      });
    }
    // Handle Square transactions
    else if (transaction.source === 'square' && transaction.lineItems) {
      const totalItemRevenue = transaction.lineItems.reduce((sum, item) => 
        sum + ((item.grossSalesMoney?.amount ?? item.price * 100) / 100) * item.quantity, 0);

      transaction.lineItems.forEach((item, index) => {
        const quantity = item.quantity;
        const price = (item.grossSalesMoney?.amount ?? item.price * 100) / 100;
        const revenue = price * quantity;
        
        // Calculate this item's share of tax and fees based on its proportion of total revenue
        const revenueShare = revenue / totalItemRevenue;
        const itemTaxShare = calculatedTax * revenueShare;
        const itemFeesShare = creditCardFees * revenueShare;

        const calculation: ProfitCalculation = {
          name: item.name,
          quantity,
          salePrice: price,
          itemCost: 0,
          itemProfit: revenue - itemTaxShare - itemFeesShare,
          hasCostData: false
        };

        profitDetails.totalRevenue += revenue;
        profitDetails.lineItemProfits.push(calculation);
        profitDetails.itemsWithoutCost++;
      });
    }
    // Handle manual transactions
    else if (transaction.source === 'manual' && transaction.products) {
      const totalItemRevenue = transaction.products.reduce((sum, product) => 
        sum + product.totalPrice, 0);

      transaction.products.forEach((product, index) => {
        const quantity = product.quantity;
        const price = product.unitPrice;
        const revenue = product.totalPrice;
        
        // Calculate this item's share of tax and fees based on its proportion of total revenue
        const revenueShare = revenue / totalItemRevenue;
        const itemTaxShare = calculatedTax * revenueShare;
        const itemFeesShare = creditCardFees * revenueShare;

        const calculation: ProfitCalculation = {
          name: product.name,
          quantity,
          salePrice: price,
          itemCost: 0,
          itemProfit: 0,
          hasCostData: false
        };

        if (product.mongoProduct?.averageCost) {
          const costPerUnit = product.mongoProduct.averageCost;
          const totalCost = costPerUnit * quantity;
          const profit = revenue - totalCost - itemTaxShare - itemFeesShare;

          calculation.itemCost = totalCost;
          calculation.itemProfit = profit;
          calculation.hasCostData = true;

          profitDetails.totalCost += totalCost;
          profitDetails.totalProfit += profit;
        } else {
          profitDetails.itemsWithoutCost++;
        }

        profitDetails.totalRevenue += revenue;
        profitDetails.lineItemProfits.push(calculation);
      });
    }

    // Update the final profit calculation
    profitDetails.totalRevenue = preTaxAmount + (transaction.tip ?? 0); // Total revenue is pre-tax amount plus tip
    profitDetails.totalProfit = profitDetails.totalRevenue - profitDetails.totalCost - calculatedTax - creditCardFees;
    profitDetails.creditCardFees = creditCardFees;

    // Update transaction with calculated tax
    setTransaction(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        taxAmount: calculatedTax,
        preTaxAmount: preTaxAmount
      };
    });

    console.log('[Profit Calc] Final calculation results:', {
      totalRevenue: profitDetails.totalRevenue,
      totalCost: profitDetails.totalCost,
      totalProfit: profitDetails.totalProfit,
      margin: ((profitDetails.totalProfit / profitDetails.totalRevenue) * 100).toFixed(1) + '%',
      itemsWithoutCost: profitDetails.itemsWithoutCost,
      calculatedTax,
      tip: transaction.tip,
      creditCardFees: creditCardFees.toFixed(2)
    });

    setProfitDetails(profitDetails);
  };

  const saveProfitCalculation = async () => {
    if (!transaction || !profitDetails) {
      console.log('[Save Profit] Missing required data:', {
        hasTransaction: !!transaction,
        hasProfitDetails: !!profitDetails
      });
      return;
    }

    try {
      setSaving(true);
      console.log('[Save Profit] Sending data to API:', {
        transactionId: transaction._id,
        profitDetails: {
          totalProfit: profitDetails.totalProfit,
          totalCost: profitDetails.totalCost,
          totalRevenue: profitDetails.totalRevenue,
          itemCount: profitDetails.lineItemProfits.length,
          itemsWithoutCost: profitDetails.itemsWithoutCost
        },
        taxDetails: {
          taxAmount: transaction.taxAmount,
          preTaxAmount: transaction.preTaxAmount
        }
      });

      const response = await fetch(`/api/transactions/${transaction._id}/profit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          profitDetails,
          taxDetails: {
            taxAmount: transaction.taxAmount,
            preTaxAmount: transaction.preTaxAmount
          },
          calculatedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        console.error('[Save Profit] API request failed:', {
          status: response.status,
          statusText: response.statusText
        });
        throw new Error('Failed to save profit calculation');
      }

      const updatedTransaction = await response.json();
      console.log('[Save Profit] Successfully saved profit calculation:', {
        transactionId: updatedTransaction._id,
        updatedAt: updatedTransaction.updatedAt,
        taxAmount: updatedTransaction.taxAmount,
        preTaxAmount: updatedTransaction.preTaxAmount
      });

      setTransaction(updatedTransaction);
      alert('Profit calculation and tax details saved successfully');
    } catch (err) {
      console.error('[Save Profit] Error:', err);
      alert('Failed to save profit calculation');
    } finally {
      setSaving(false);
    }
  };

  const recalculateSalesTax = () => {
    if (!transaction) return;

    const TAX_RATE = 0.08875;
    
    // Calculate subtotal from line items
    let subtotal = 0;
    if (transaction.source === 'manual' && transaction.products) {
      subtotal = transaction.products.reduce((sum, product) => sum + product.totalPrice, 0);
    } else if (transaction.lineItems) {
      subtotal = transaction.lineItems.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
    }
    
    // Calculate tax based on subtotal
    const calculatedTax = subtotal * TAX_RATE;

    // Update the transaction state with new tax amount
    setTransaction(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        taxAmount: calculatedTax,
        preTaxAmount: subtotal
      };
    });

    console.log('[Tax Recalc] Recalculated sales tax:', {
      totalAmount: transaction.amount,
      tipAmount: transaction.tip ?? 0,
      subtotal: subtotal.toFixed(2),
      calculatedTax: calculatedTax.toFixed(2),
      originalTax: transaction.taxAmount?.toFixed(2),
      taxRate: '8.875%'
    });
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-600">Error: {error}</div>
      </div>
    )
  }

  if (!transaction) {
    return (
      <div className="p-4">
        <div>Transaction not found</div>
      </div>
    )
  }

  const formatSource = (source: string | undefined) => {
    if (!source) return 'Unknown'
    return source.charAt(0).toUpperCase() + source.slice(1)
  }

  const renderLineItems = () => {
    if (!transaction) return null;

    if (transaction.source === 'shopify' && transaction.lineItems) {
      return transaction.lineItems.map((item) => (
        <div key={item.variant_id || item.name} className="flex items-center">
          <span>{item.quantity}x</span>
          <span className="ml-2">{item.name}</span>
          {item.sku && <span className="ml-2 text-gray-500">({item.sku})</span>}
          <span className="ml-2 text-gray-500">
            (${(Number(item.price) * item.quantity).toFixed(2)})
          </span>
        </div>
      ));
    }

    if (transaction.source === 'square' && transaction.lineItems) {
      return transaction.lineItems.map((item) => (
        <div key={item.name} className="flex items-center">
          <span>{item.quantity}x</span>
          <span className="ml-2">{item.name ?? 'Unnamed Product'}</span>
          {item.variationName && <span className="ml-1">({item.variationName})</span>}
          <span className="ml-2 text-gray-500">
            (${((item.grossSalesMoney?.amount ?? item.price * 100) / 100).toFixed(2)})
          </span>
        </div>
      ));
    }

    return (
      <div className="text-gray-600">
        {transaction.description || 'No items'}
      </div>
    )
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-4">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Transactions
        </Button>
      </div>

      <Card className="p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                ${transaction.amount.toFixed(2)}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-1 text-sm rounded bg-purple-100 text-purple-700">
                  {formatSource(transaction.source)}
                </span>
                <span className="text-gray-500">
                  {new Date(transaction.date).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Transaction ID</div>
              <div className="font-mono">{transaction.id}</div>
              {transaction.source === 'shopify' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refetchShopifyFees}
                  disabled={fetchingFees}
                  className="mt-2 text-xs"
                >
                  {fetchingFees ? 'Fetching...' : 'Refetch Shopify Fees'}
                </Button>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="font-medium">Status:</span>
            <span className={cn(
              transaction.status === 'completed' ? 'text-green-600' : 'text-red-600'
            )}>
              {(transaction.status ?? 'UNKNOWN').toUpperCase()}
            </span>
          </div>

          {/* Customer Info */}
          {(transaction.customer || transaction.paymentMethod) && (
            <div className="space-y-2">
              {transaction.customer && (
                <div>
                  <span className="font-medium">Customer:</span>
                  <span className="ml-2">{transaction.customer}</span>
                </div>
              )}
              {transaction.paymentMethod && (
                <div>
                  <span className="font-medium">Payment Method:</span>
                  <span className="ml-2">{transaction.paymentMethod}</span>
                </div>
              )}
            </div>
          )}

          {/* Line Items */}
          <div>
            <h2 className="text-lg font-medium mb-3">Items</h2>
            {renderLineItems()}
          </div>

          {/* Totals */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>${(() => {
                // Calculate subtotal from line items
                if (transaction.source === 'manual' && transaction.products) {
                  return transaction.products.reduce((sum, product) => sum + product.totalPrice, 0).toFixed(2);
                } else if (transaction.lineItems) {
                  return transaction.lineItems.reduce((sum, item) => 
                    sum + (Number(item.price) * item.quantity), 0
                  ).toFixed(2);
                }
                return (transaction.amount - (transaction.taxAmount ?? 0)).toFixed(2);
              })()}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Taxable Amount:</span>
              <span>${transaction.preTaxAmount?.toFixed(2) ?? '0.00'}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span>Tax:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={recalculateSalesTax}
                  className="text-xs"
                >
                  Recalculate (8.875%)
                </Button>
              </div>
              <span>${transaction.taxAmount?.toFixed(2) ?? '0.00'}</span>
            </div>
            {transaction.tip && (
              <div className="flex justify-between text-green-600">
                <span>Tip:</span>
                <span>+${transaction.tip.toFixed(2)}</span>
              </div>
            )}
            {transaction.discount && (
              <div className="flex justify-between text-red-600">
                <span>Discount:</span>
                <span>-${transaction.discount.toFixed(2)}</span>
              </div>
            )}
            {profitDetails && (
              <div className="mt-4 pt-4 border-t">
                <div className="font-medium mb-2">Profit Calculation</div>
                <div className="space-y-1 text-sm">
                  {/* Revenue */}
                  <div className="flex justify-between">
                    <span>Total Revenue:</span>
                    <span>${profitDetails.totalRevenue.toFixed(2)}</span>
                  </div>
                  {transaction?.tip && transaction.tip > 0 && (
                    <div className="flex justify-between text-gray-500 pl-4">
                      <span>Including Tip:</span>
                      <span>+${transaction.tip.toFixed(2)}</span>
                    </div>
                  )}
                  
                  {/* Costs */}
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <div className="text-gray-500 mb-1">Costs:</div>
                    <div className="flex justify-between text-gray-500 pl-4">
                      <span>Cost of Goods:</span>
                      <span>-${profitDetails.totalCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500 pl-4">
                      <span>Sales Tax:</span>
                      <span>-${taxAmount.toFixed(2)}</span>
                    </div>
                    {!isVenmoTransaction && (
                      <div className="flex justify-between text-gray-500 pl-4">
                        <span>Credit Card Fees:</span>
                        <span>-${creditCardFees.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-500 font-medium pt-1">
                      <span>Total Costs:</span>
                      <span>-${(profitDetails.totalCost + taxAmount + creditCardFees).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Net Profit */}
                  <div className="flex justify-between font-medium pt-2 border-t">
                    <span>Net Profit:</span>
                    <span className={profitDetails.totalProfit >= 0 ? "text-green-600" : "text-red-600"}>
                      ${profitDetails.totalProfit.toFixed(2)}
                    </span>
                  </div>

                  {/* Profit Metrics */}
                  <div className="pt-2 space-y-1 text-sm text-gray-500">
                    <div className="flex justify-between">
                      <span>Profit Margin:</span>
                      <span>{((profitDetails.totalProfit / profitDetails.totalRevenue) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cost as % of Revenue:</span>
                      <span>{((profitDetails.totalCost / profitDetails.totalRevenue) * 100).toFixed(1)}%</span>
                    </div>
                    {profitDetails.itemsWithoutCost > 0 && (
                      <div className="text-yellow-600 mt-2">
                        Note: {profitDetails.itemsWithoutCost} item(s) missing cost data
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg pt-4 border-t">
              <span>Total:</span>
              <span>${transaction.amount.toFixed(2)}</span>
            </div>
          </div>

          {/* Add Calculate Profit button after the header */}
          <div className="flex justify-end">
            <Button
              onClick={() => {
                console.log('[Button] Calculate Profit clicked');
                console.log('[Button] Transaction data:', {
                  id: transaction._id,
                  source: transaction.source,
                  products: transaction.products?.length ?? 0,
                  lineItems: transaction.lineItems?.length ?? 0
                });
                calculateProfit();
              }}
              className="gap-2"
            >
              <Calculator className="w-4 h-4" />
              Calculate Profit
            </Button>
            {profitDetails && (
              <Button
                onClick={saveProfitCalculation}
                disabled={saving}
                variant="outline"
                className="gap-2 ml-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Calculation'}
              </Button>
            )}
          </div>

          {/* Debug info only */}
          {profitDetails && (
            <div className="p-4 bg-gray-100 rounded text-sm font-mono mt-4">
              <h3 className="font-bold mb-2">Debug Info:</h3>
              <div>Transaction ID: {transaction._id}</div>
              <div>Source: {transaction.source}</div>
              <div>Line Items: {transaction.lineItems?.length ?? 0}</div>
              <div>Items with MongoDB Products: {
                transaction.lineItems?.filter(item => item.mongoProduct)?.length ?? 0
              }</div>
              <div>Items with Cost Data: {
                transaction.lineItems?.filter(item => item.mongoProduct?.averageCost)?.length ?? 0
              }</div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
} 