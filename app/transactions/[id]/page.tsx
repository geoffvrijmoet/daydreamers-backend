'use client'

import { useEffect, useState } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Calculator, Save, Edit2 } from "lucide-react"
import { useRouter } from 'next/navigation'
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

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
  name: string;
  quantity: number;
  price: number;
  variant_id?: string;
  sku?: string;
  variationName?: string;
  grossSalesMoney?: { amount: number };
  mongoProduct?: {
    _id: string;
    name: string;
    averageCost: number;
    sku?: string;
    currentStock?: number;
  };
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
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  productId?: string;
  mongoProduct?: {
    _id: string;
    name: string;
    averageCost: number;
    sku?: string;
    currentStock?: number;
  };
}

export default function TransactionPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [transaction, setTransaction] = useState<TransactionDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profitDetails, setProfitDetails] = useState<TransactionProfitDetails | null>(null)
  const [saving, setSaving] = useState(false)
  const [fetchingFees, setFetchingFees] = useState(false)
  const [fetchingSquareDetails, setFetchingSquareDetails] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [isEditingTotal, setIsEditingTotal] = useState(false)
  const [editedTotal, setEditedTotal] = useState<number>(0)
  const [isEditingFee, setIsEditingFee] = useState(false)
  const [editedFee, setEditedFee] = useState<number>(0)

  // Move these calculations into the component scope
  const taxAmount = transaction?.taxAmount ?? 0;
  const isVenmoTransaction = transaction?.source === 'venmo' || transaction?.paymentMethod === 'Venmo';
  const creditCardFees = isVenmoTransaction ? 0 : 
    transaction?.source === 'shopify' && transaction?.shopifyProcessingFee ? 
      transaction.shopifyProcessingFee :
    transaction?.source === 'square' ?
      // Square fee is 2.6% + $0.10 per transaction
      ((transaction.amount * 0.026) + 0.10) :
      0;

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

  const refetchSquareDetails = async () => {
    if (!transaction || transaction.source !== 'square') return;

    try {
      setFetchingSquareDetails(true);
      
      console.log('[Refetch Square] Starting details fetch:', {
        transactionId: transaction._id,
        transactionInternalId: transaction.id
      });

      const response = await fetch(`/api/transactions/${transaction._id}/square-details`, {
        method: 'POST'
      });

      console.log('[Refetch Square] Response received:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch Square details');
      }

      const data = await response.json();
      console.log('[Refetch Square] Success:', {
        message: data.message,
        updatedTransaction: data.transaction
      });

      setTransaction(data.transaction);
      alert('Successfully updated Square transaction details');
    } catch (err) {
      console.error('[Refetch Square] Error:', err);
      alert(err instanceof Error ? err.message : 'Failed to fetch Square details');
    } finally {
      setFetchingSquareDetails(false);
    }
  };

  useEffect(() => {
    const fetchTransaction = async () => {
      try {
        console.log('[Transaction Load] Starting fetch for transaction:', params.id);
        const response = await fetch(`/api/transactions/${params.id}`)
        if (!response.ok) {
          throw new Error('Failed to fetch transaction')
        }
        const data = await response.json()

        // Normalize line items to always use lineItems key
        if (data.line_items && !data.lineItems) {
          console.log('[Transaction Load] Normalizing line_items to lineItems');
          data.lineItems = data.line_items;
          delete data.line_items;
        }

        console.log('[Transaction Load] Initial transaction data:', {
          id: data._id,
          source: data.source,
          amount: data.amount,
          lineItemCount: data.lineItems?.length ?? 0,
          productCount: data.products?.length ?? 0,
          hasProfitCalculation: !!data.profitCalculation
        });

        // If it's a manual transaction, fetch MongoDB products for all products
        if (data.source === 'manual' && data.products?.length > 0) {
          console.log('[Transaction Load] Starting MongoDB product fetch for manual products:', 
            data.products.map((p: ManualProduct) => ({ name: p.name, productId: p.productId }))
          );

          const updatedProducts = await Promise.all(
            data.products.map(async (product: ManualProduct) => {
              if (!product.productId) {
                console.log(`[Transaction Load] Skipping MongoDB fetch - no productId for ${product.name}`);
                return product;
              }
              
              try {
                console.log(`[Transaction Load] Fetching MongoDB product for ${product.name} (ID: ${product.productId})`);
                const productResponse = await fetch(`/api/products/${product.productId}`);
                const productData = await productResponse.json();
                
                if (productData) {
                  console.log(`[Transaction Load] Successfully fetched MongoDB product for ${product.name}:`, {
                    name: productData.name,
                    sku: productData.sku,
                    averageCost: productData.averageCost,
                    currentStock: productData.currentStock
                  });
                  return { ...product, mongoProduct: productData };
                }
              } catch (err) {
                console.error(`[Transaction Load] Error fetching MongoDB product for ${product.name}:`, err);
              }
              
              return product;
            })
          );

          console.log('[Transaction Load] Completed manual product updates:', 
            updatedProducts.map((p: ManualProduct) => ({
              name: p.name,
              hasMongoProduct: !!p.mongoProduct,
              mongoProductSku: p.mongoProduct?.sku
            }))
          );

          data.products = updatedProducts;
        }
        // If it's a Shopify transaction, fetch MongoDB products for all line items
        else if (data.source === 'shopify' && data.lineItems?.length > 0) {
          console.log('[Transaction Load] Starting MongoDB product fetch for Shopify line items:', 
            data.lineItems.map((item: LineItem) => ({ 
              name: item.name, 
              variantId: item.variant_id 
            }))
          );

          const updatedLineItems = await Promise.all(
            data.lineItems!.map(async (item: LineItem) => {
              if (!item.variant_id) {
                console.log(`[Transaction Load] Skipping MongoDB fetch - no variant_id for ${item.name}`);
                return item;
              }
              
              try {
                console.log(`[Transaction Load] Fetching MongoDB product for ${item.name} (Variant ID: ${item.variant_id})`);
                const productResponse = await fetch(`/api/products/shopify/find-by-variant?variantId=${item.variant_id}`);
                const productData = await productResponse.json();
                
                if (productData.product) {
                  console.log(`[Transaction Load] Successfully fetched MongoDB product for ${item.name}:`, {
                    name: productData.product.name,
                    sku: productData.product.sku,
                    averageCost: productData.product.averageCost,
                    currentStock: productData.product.currentStock
                  });
                  return { ...item, mongoProduct: productData.product };
                }
              } catch (err) {
                console.error(`[Transaction Load] Error fetching MongoDB product for ${item.name}:`, err);
              }
              
              return item;
            })
          );

          console.log('[Transaction Load] Completed Shopify line item updates:', 
            updatedLineItems.map((item: LineItem) => ({
              name: item.name,
              hasMongoProduct: !!item.mongoProduct,
              mongoProductSku: item.mongoProduct?.sku
            }))
          );

          data.lineItems = updatedLineItems;
        }
        // If it's a Square transaction, fetch MongoDB products for all line items
        else if (data.source === 'square' && data.lineItems?.length > 0) {
          console.log('[Transaction Load] Starting MongoDB product fetch for Square line items:', 
            data.lineItems.map((item: LineItem) => ({ 
              name: item.name, 
              sku: item.sku // This should be the Square catalogObjectId
            }))
          );

          const updatedLineItems = await Promise.all(
            data.lineItems!.map(async (item: LineItem) => {
              if (!item.sku) {
                console.log(`[Transaction Load] Skipping MongoDB fetch - no SKU/catalogObjectId for ${item.name}`);
                return item;
              }
              
              try {
                console.log(`[Transaction Load] Fetching MongoDB product for ${item.name} (Square ID: ${item.sku})`);
                const productResponse = await fetch(`/api/products/square/${item.sku}`);
                const productData = await productResponse.json();
                
                if (productData.product) {
                  console.log(`[Transaction Load] Successfully fetched MongoDB product for ${item.name}:`, {
                    name: productData.product.name,
                    sku: productData.product.sku,
                    averageCost: productData.product.averageCost,
                    currentStock: productData.product.currentStock
                  });
                  return { ...item, mongoProduct: productData.product };
                }
              } catch (err) {
                console.error(`[Transaction Load] Error fetching MongoDB product for ${item.name}:`, err);
              }
              
              return item;
            })
          );

          console.log('[Transaction Load] Completed Square line item updates:', 
            updatedLineItems.map((item: LineItem) => ({
              name: item.name,
              hasMongoProduct: !!item.mongoProduct,
              mongoProductSku: item.mongoProduct?.sku
            }))
          );

          data.lineItems = updatedLineItems;
        }

        console.log('[Transaction Load] Setting final transaction data:', {
          id: data._id,
          source: data.source,
          lineItemCount: data.lineItems?.length ?? 0,
          lineItemsWithMongo: data.lineItems?.filter((item: LineItem) => item.mongoProduct).length ?? 0,
          productCount: data.products?.length ?? 0,
          productsWithMongo: data.products?.filter((p: ManualProduct) => p.mongoProduct).length ?? 0
        });

        setTransaction(data);

        // If transaction has existing profit calculation, set it
        if (data.profitCalculation) {
          console.log('[Transaction Load] Setting existing profit calculation:', {
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
    
    // Calculate pre-tax amount and tax
    preTaxAmount = transaction.preTaxAmount;
    calculatedTax = transaction.taxAmount;

    if (!preTaxAmount || !calculatedTax) {
      if (transaction.source === 'shopify') {
        // For Shopify, we can trust the tax amount directly
        preTaxAmount = transaction.amount - (transaction.taxAmount ?? 0) - (transaction.tip ?? 0);
        calculatedTax = transaction.taxAmount ?? 0;
      } else if (transaction.source === 'square') {
        // For Square, we need to work backwards from the total
        // Subtotal includes tax but not tip
        const subtotal = transaction.amount - (transaction.tip ?? 0);
        // Work backwards to find pre-tax amount
        preTaxAmount = subtotal / (1 + TAX_RATE);
        calculatedTax = subtotal - preTaxAmount;

        console.log('[Square Tax] Calculation:', {
          total: transaction.amount,
          tip: transaction.tip,
          subtotal,
          preTaxAmount,
          calculatedTax,
          effectiveTaxRate: ((calculatedTax / preTaxAmount) * 100).toFixed(3) + '%'
        });
      } else {
        // For manual transactions, assume no tax
        preTaxAmount = transaction.amount;
        calculatedTax = 0;
      }
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
      const itemRevenues = transaction.lineItems.map((item: LineItem) => ({
        itemId: item.variant_id,
        revenue: Number(item.price) * item.quantity
      }));
      
      const totalItemRevenue = itemRevenues.reduce((sum: number, item: { revenue: number }) => sum + item.revenue, 0);

      transaction.lineItems.forEach((item: LineItem) => {
        console.log(`[Profit Calc] Processing item:`, {
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
          quantity,
          salePrice: salePrice,
          itemCost: 0,
          itemProfit: 0,
          hasCostData: false
        };

        if (item.mongoProduct?.averageCost) {
          const costPerUnit = item.mongoProduct.averageCost;
          const totalCost = costPerUnit * quantity;
          // Profit = Revenue - Cost - Item's share of tax and fees
          const profit = revenue - totalCost - itemTaxShare - itemFeesShare;

          console.log(`[Profit Calc] Item ${quantity} profit calculation:`, {
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
          console.log(`[Profit Calc] Item ${quantity} missing cost data`);
          profitDetails.itemsWithoutCost++;
        }

        profitDetails.totalRevenue += revenue;
        profitDetails.lineItemProfits.push(calculation);
      });
    }
    // Handle Square transactions
    else if (transaction.source === 'square' && transaction.lineItems) {
      console.log('[Profit Calc] Processing Square transaction line items:', transaction.lineItems.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: (item.grossSalesMoney?.amount ?? item.price * 100) / 100,
        hasMongoProduct: !!item.mongoProduct,
        mongoProductDetails: item.mongoProduct ? {
          name: item.mongoProduct.name,
          sku: item.mongoProduct.sku,
          averageCost: item.mongoProduct.averageCost,
          currentStock: item.mongoProduct.currentStock
        } : null
      })));

      console.log('[Profit Calc] Square transaction details:', {
        totalAmount: transaction.amount,
        preTaxAmount: transaction.preTaxAmount,
        taxAmount: transaction.taxAmount,
        tip: transaction.tip,
        creditCardFees
      });

      const totalItemRevenue = transaction.lineItems.reduce((sum: number, item: LineItem) => 
        sum + ((item.grossSalesMoney?.amount ?? item.price * 100) / 100) * item.quantity, 0);

      transaction.lineItems.forEach((item: LineItem) => {
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
          itemProfit: 0,
          hasCostData: false
        };

        if (item.mongoProduct?.averageCost) {
          const costPerUnit = item.mongoProduct.averageCost;
          const totalCost = costPerUnit * quantity;
          const profit = revenue - totalCost - itemTaxShare - itemFeesShare;

          console.log(`[Profit Calc] Item ${item.name} profit calculation:`, {
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
          console.log(`[Profit Calc] Item ${item.name} missing cost data:`, {
            mongoProduct: item.mongoProduct ? {
              name: item.mongoProduct.name,
              sku: item.mongoProduct.sku,
              averageCost: item.mongoProduct.averageCost
            } : 'No MongoDB product linked'
          });
          profitDetails.itemsWithoutCost++;
        }

        profitDetails.totalRevenue += revenue;
        profitDetails.lineItemProfits.push(calculation);
      });
    }
    // Handle manual transactions
    else if (transaction.source === 'manual' && transaction.products) {
      const totalItemRevenue = transaction.products.reduce((sum, product) => sum + product.totalPrice, 0);

      transaction.products.forEach((item: ManualProduct) => {
        console.log(`[Profit Calc] Processing manual product:`, {
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          mongoProduct: item.mongoProduct
        });

        const quantity = item.quantity;
        const price = item.unitPrice;
        const revenue = item.totalPrice;
        
        // Calculate this item's share of tax and fees based on its proportion of total revenue
        const revenueShare = revenue / totalItemRevenue;
        const itemTaxShare = calculatedTax * revenueShare;
        const itemFeesShare = creditCardFees * revenueShare;

        const calculation: ProfitCalculation = {
          name: item.name,
          quantity,
          salePrice: price,
          itemCost: 0,
          itemProfit: 0,
          hasCostData: false
        };

        if (item.mongoProduct?.averageCost) {
          const costPerUnit = item.mongoProduct.averageCost;
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
    profitDetails.totalRevenue = transaction.amount; // Total revenue is the full amount including tax
    profitDetails.creditCardFees = creditCardFees;
    
    // Calculate total costs (cost of goods + tax + fees)
    const totalCosts = profitDetails.totalCost + calculatedTax + creditCardFees;
    
    // Final profit = Total Revenue - All Costs
    profitDetails.totalProfit = profitDetails.totalRevenue - totalCosts;

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
    
    // For manual sales, calculate tax from total amount (which includes tax)
    if (transaction.source === 'manual') {
      // Remove tip from total to get amount including tax
      const totalWithTax = transaction.amount - (transaction.tip ?? 0);
      
      // Calculate pre-tax amount: total / (1 + tax_rate)
      const preTaxAmount = totalWithTax / (1 + TAX_RATE);
      
      // Calculate tax amount
      const calculatedTax = totalWithTax - preTaxAmount;

      // Update the transaction state with new tax amount
      setTransaction(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          taxAmount: calculatedTax,
          preTaxAmount: preTaxAmount
        };
      });

      console.log('[Tax Recalc] Recalculated sales tax for manual sale:', {
        totalAmount: transaction.amount,
        tipAmount: transaction.tip ?? 0,
        totalWithTax,
        preTaxAmount: preTaxAmount.toFixed(2),
        calculatedTax: calculatedTax.toFixed(2),
        taxRate: '8.875%'
      });
      return;
    }
    
    // For non-manual sales, keep existing logic
    let subtotal = 0;
    if (transaction.products) {
      subtotal = transaction.products.reduce((sum, product) => sum + product.totalPrice, 0);
    } else if (transaction.lineItems) {
      subtotal = transaction.lineItems.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
    }
    
    const calculatedTax = subtotal * TAX_RATE;

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

  const handleCustomerUpdate = async () => {
    if (!transaction) return;
    
    try {
      setSaving(true);
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customer: customerName
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update customer');
      }

      await response.json(); // Just consume the response
      setTransaction(prev => prev ? { ...prev, customer: customerName } : null);
      setEditingCustomer(false);
      alert('Customer updated successfully');
    } catch (err) {
      console.error('Error updating customer:', err);
      alert('Failed to update customer');
    } finally {
      setSaving(false);
    }
  };

  const getCalculatedAmounts = (total: number) => {
    const TAX_RATE = 0.08875;
    
    // First, calculate the expected retail amount (pre-tax + tax)
    let expectedTotal = 0;
    if (transaction?.source === 'manual' && transaction.products) {
      // For manual transactions with products, use product totals
      expectedTotal = transaction.products.reduce((sum, product) => sum + product.totalPrice, 0);
    } else if (transaction?.lineItems) {
      // For transactions with line items, calculate from items
      expectedTotal = transaction.lineItems.reduce((sum, item) => 
        sum + (Number(item.price) * item.quantity), 0
      );
    } else {
      // For other cases, use the current pre-tax amount if available
      expectedTotal = transaction?.preTaxAmount ? 
        transaction.preTaxAmount * (1 + TAX_RATE) : 
        total; // Fallback to new total if no reference point
    }

    // Calculate tip or discount based on difference from expected total
    let tip = 0;
    let discount = 0;
    
    if (total > expectedTotal) {
      tip = total - expectedTotal;
    } else if (total < expectedTotal) {
      discount = expectedTotal - total;
    }

    // Now calculate tax amounts based on the actual retail amount (total - tip)
    const totalWithoutTip = total - tip;
    const preTaxAmount = totalWithoutTip / (1 + TAX_RATE);
    const calculatedTax = totalWithoutTip - preTaxAmount;

    // Calculate profit details if we have the data
    let profitCalc = null;
    if (transaction) {
      const isVenmoTransaction = transaction.source === 'venmo' || transaction.paymentMethod === 'Venmo';
      const creditCardFees = isVenmoTransaction ? 0 : 
        transaction.source === 'shopify' && transaction.shopifyProcessingFee ? 
          transaction.shopifyProcessingFee : 
          0;

      profitCalc = {
        totalRevenue: preTaxAmount + tip,
        totalCost: profitDetails?.totalCost ?? 0,
        totalProfit: preTaxAmount + tip - (profitDetails?.totalCost ?? 0) - calculatedTax - creditCardFees,
        creditCardFees,
        taxAmount: calculatedTax
      };
    }

    console.log('[Total Update] Calculated amounts:', {
      newTotal: total,
      expectedTotal: expectedTotal.toFixed(2),
      tip: tip.toFixed(2),
      discount: discount.toFixed(2),
      preTaxAmount: preTaxAmount.toFixed(2),
      calculatedTax: calculatedTax.toFixed(2)
    });

    return {
      preTaxAmount,
      taxAmount: calculatedTax,
      tip,
      discount,
      profitDetails: profitCalc
    };
  };

  const handleTotalUpdate = async () => {
    if (!transaction) return;
    
    try {
      setSaving(true);
      const { preTaxAmount, taxAmount, tip, discount } = getCalculatedAmounts(editedTotal);
      
      const response = await fetch(`/api/transactions/${transaction._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: editedTotal,
          preTaxAmount,
          taxAmount,
          tip: tip > 0 ? tip : undefined,
          discount: discount > 0 ? discount : undefined
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update total');
      }

      // No need to update local state here since it's already updated in real-time
      setIsEditingTotal(false);
    } catch (error) {
      console.error('Failed to update total:', error);
      setError(error instanceof Error ? error.message : 'Failed to update total');
      // Revert changes on error
      if (transaction) {
        const { preTaxAmount, taxAmount, tip, discount, profitDetails: originalProfitDetails } = getCalculatedAmounts(transaction.amount);
        setTransaction(prev => prev ? {
          ...prev,
          amount: transaction.amount,
          preTaxAmount,
          taxAmount,
          tip: tip > 0 ? tip : undefined,
          discount: discount > 0 ? discount : undefined
        } : null);
        if (originalProfitDetails) {
          setProfitDetails(prev => prev ? {
            ...prev,
            totalRevenue: originalProfitDetails.totalRevenue,
            totalProfit: originalProfitDetails.totalProfit,
            creditCardFees: originalProfitDetails.creditCardFees
          } : null);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFindMongoProduct = async (item: LineItem) => {
    if (!transaction || !item.variant_id) return;

    try {
      console.log(`[Product Fetch] Fetching MongoDB product for ${item.name} (Variant ID: ${item.variant_id})`);
      const response = await fetch(`/api/products/shopify/find-by-variant?variantId=${item.variant_id}`);
      
      if (!response.ok) {
        throw new Error('Failed to find product');
      }

      const data = await response.json();
      
      if (!data.product) {
        console.log(`[Product Fetch] No MongoDB product found for ${item.name}`);
        return;
      }

      console.log(`[Product Fetch] Found MongoDB product:`, {
        name: data.product.name,
        sku: data.product.sku,
        averageCost: data.product.averageCost
      });

      // Update the transaction's line items with the found MongoDB product
      setTransaction(prev => {
        if (!prev || !prev.lineItems) return prev;
        return {
          ...prev,
          lineItems: prev.lineItems.map(lineItem => 
            lineItem.variant_id === item.variant_id
              ? { ...lineItem, mongoProduct: data.product }
              : lineItem
          )
        };
      });

    } catch (err) {
      console.error(`[Product Fetch] Error:`, err);
    }
  };

  const handleFeeUpdate = async () => {
    if (!transaction) return;
    
    try {
      setSaving(true);
      const response = await fetch(`/api/transactions/${transaction._id}/fees`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          processingFee: editedFee
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update fee');
      }

      await response.json(); // Just await the response without storing it
      setTransaction(prev => prev ? {
        ...prev,
        shopifyProcessingFee: editedFee
      } : null);
      setIsEditingFee(false);
      
      // Recalculate profit with new fee
      calculateProfit();
    } catch (error) {
      console.error('Failed to update fee:', error);
      setError(error instanceof Error ? error.message : 'Failed to update fee');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (transaction) {
      setCustomerName(transaction.customer || '');
      setEditedTotal(transaction.amount);
      setEditedFee(transaction.shopifyProcessingFee || 0);
    }
  }, [transaction]);

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
    if (!transaction) {
      console.log('[Product Display] No transaction data available');
      return null;
    }

    console.log('[Product Display] Starting render for transaction:', {
      id: transaction._id,
      source: transaction.source,
      hasLineItems: !!transaction.lineItems,
      lineItemCount: transaction.lineItems?.length ?? 0,
      hasProducts: !!transaction.products,
      productCount: transaction.products?.length ?? 0
    });

    if (transaction.source === 'shopify' && transaction.lineItems) {
      console.log('[Product Display] Rendering Shopify line items:', transaction.lineItems.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: (Number(item.price) * item.quantity).toFixed(2),
        hasMongoProduct: !!item.mongoProduct,
        mongoProductDetails: item.mongoProduct ? {
          name: item.mongoProduct.name,
          sku: item.mongoProduct.sku,
          currentStock: item.mongoProduct.currentStock
        } : null
      })));

      return transaction.lineItems.map(item => (
        <div key={`${item.variant_id || item.name}-${item.quantity}-${item.price}`} className="flex items-center justify-between">
          <div className="flex items-center">
            <span>{item.quantity}x</span>
            <span className="ml-2">{item.name}</span>
            {item.sku && <span className="ml-2 text-gray-500">({item.sku})</span>}
            <span className="ml-2 text-gray-500">
              (${(Number(item.price) * item.quantity).toFixed(2)})
            </span>
          </div>
          <div>
            {item.mongoProduct ? (
              <span className="text-sm text-green-600">
                → {item.mongoProduct.name} (Stock: {item.mongoProduct.currentStock})
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleFindMongoProduct(item)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Find Product
              </Button>
            )}
          </div>
        </div>
      ));
    }

    if (transaction.source === 'square' && transaction.lineItems) {
      console.log('[Product Display] Rendering Square line items:', transaction.lineItems.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        grossSalesAmount: item.grossSalesMoney?.amount,
        calculatedTotal: ((item.grossSalesMoney?.amount ?? item.price * 100) / 100).toFixed(2),
        hasMongoProduct: !!item.mongoProduct,
        mongoProductDetails: item.mongoProduct ? {
          name: item.mongoProduct.name,
          sku: item.mongoProduct.sku,
          currentStock: item.mongoProduct.currentStock
        } : null
      })));

      return transaction.lineItems.map(item => (
        <div key={`${item.name}-${item.quantity}-${item.price}`} className="flex items-center">
          <span>{item.quantity}x</span>
          <span className="ml-2">{item.name ?? 'Unnamed Product'}</span>
          {item.variationName && <span className="ml-1">({item.variationName})</span>}
          <span className="ml-2 text-gray-500">
            (${((item.grossSalesMoney?.amount ?? item.price * 100) / 100).toFixed(2)})
          </span>
          {item.mongoProduct && (
            <span className="ml-2 text-sm text-green-600">
              → {item.mongoProduct.name} (Stock: {item.mongoProduct.currentStock})
            </span>
          )}
        </div>
      ));
    }

    if (transaction.source === 'manual' && transaction.products) {
      console.log('[Product Display] Rendering manual products:', transaction.products.map(product => ({
        name: product.name,
        quantity: product.quantity,
        unitPrice: product.unitPrice,
        totalPrice: product.totalPrice,
        hasMongoProduct: !!product.mongoProduct,
        mongoProductDetails: product.mongoProduct ? {
          name: product.mongoProduct.name,
          sku: product.mongoProduct.sku,
          currentStock: product.mongoProduct.currentStock
        } : null
      })));

      return transaction.products.map((product, idx) => (
        <div key={idx} className="flex items-center">
          <span>{product.quantity}x</span>
          <span className="ml-2">{product.name}</span>
          <span className="ml-2 text-gray-500">
            (${product.totalPrice.toFixed(2)})
          </span>
          {product.mongoProduct && (
            <span className="ml-2 text-sm text-green-600">
              → {product.mongoProduct.name} (Stock: {product.mongoProduct.currentStock})
            </span>
          )}
        </div>
      ));
    }

    console.log('[Product Display] No product data found, showing description:', {
      description: transaction.description || 'No items'
    });

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
              {transaction.source === 'square' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refetchSquareDetails}
                  disabled={fetchingSquareDetails}
                  className="mt-2 text-xs"
                >
                  {fetchingSquareDetails ? 'Fetching...' : 'Re-fetch Square Details'}
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
              {transaction.customer !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Customer:</span>
                  <span className="flex-1">{transaction.customer}</span>
                  <Dialog open={editingCustomer} onOpenChange={setEditingCustomer}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Customer</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Input
                            placeholder="Customer name"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setEditingCustomer(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleCustomerUpdate}
                            disabled={saving}
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
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
                        <div className="flex items-center gap-2">
                          <span>Credit Card Fees:</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditedFee(creditCardFees);
                              setIsEditingFee(true);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        </div>
                        {isEditingFee ? (
                          <div className="flex items-center gap-2">
                            <span>$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editedFee}
                              onChange={(e) => setEditedFee(Number(e.target.value))}
                              className="w-20 h-6 text-sm"
                              autoFocus
                              onBlur={handleFeeUpdate}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleFeeUpdate();
                                } else if (e.key === 'Escape') {
                                  setIsEditingFee(false);
                                  setEditedFee(creditCardFees);
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <span>-${creditCardFees.toFixed(2)}</span>
                        )}
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
              <div className="flex items-center gap-2">
                {isEditingTotal ? (
                  <div className="flex items-center gap-2">
                    <span>$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editedTotal}
                      onChange={(e) => {
                        const newTotal = Number(e.target.value);
                        setEditedTotal(newTotal);
                        // Update transaction state with new calculated amounts
                        const { preTaxAmount, taxAmount, tip, discount, profitDetails: newProfitDetails } = getCalculatedAmounts(newTotal);
                        setTransaction(prev => prev ? {
                          ...prev,
                          amount: newTotal,
                          preTaxAmount,
                          taxAmount,
                          tip: tip > 0 ? tip : undefined,
                          discount: discount > 0 ? discount : undefined
                        } : null);
                        if (newProfitDetails) {
                          setProfitDetails(prev => prev ? {
                            ...prev,
                            totalRevenue: newProfitDetails.totalRevenue,
                            totalProfit: newProfitDetails.totalProfit,
                            creditCardFees: newProfitDetails.creditCardFees
                          } : null);
                        }
                      }}
                      className="w-24 h-8 text-right"
                      autoFocus
                      onBlur={() => {
                        setIsEditingTotal(false);
                        handleTotalUpdate();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setIsEditingTotal(false);
                          handleTotalUpdate();
                        } else if (e.key === 'Escape') {
                          setIsEditingTotal(false);
                          setEditedTotal(transaction.amount);
                          const { preTaxAmount, taxAmount, tip, discount, profitDetails: originalProfitDetails } = getCalculatedAmounts(transaction.amount);
                          setTransaction(prev => prev ? {
                            ...prev,
                            amount: transaction.amount,
                            preTaxAmount,
                            taxAmount,
                            tip: tip > 0 ? tip : undefined,
                            discount: discount > 0 ? discount : undefined
                          } : null);
                          if (originalProfitDetails) {
                            setProfitDetails(prev => prev ? {
                              ...prev,
                              totalRevenue: originalProfitDetails.totalRevenue,
                              totalProfit: originalProfitDetails.totalProfit,
                              creditCardFees: originalProfitDetails.creditCardFees
                            } : null);
                          }
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>${transaction.amount.toFixed(2)}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => {
                        setEditedTotal(transaction.amount);
                        setIsEditingTotal(true);
                      }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
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