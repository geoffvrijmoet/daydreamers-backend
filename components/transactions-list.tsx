'use client'

import { Card } from "@/components/ui/card"
import { useTransactions } from "@/lib/hooks/useTransactions"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { CalendarIcon } from "lucide-react"
import { subDays, startOfYear, startOfDay } from 'date-fns'
import { toEasternTime, formatInEasternTime } from '@/lib/utils/dates'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight } from "lucide-react"
import { ManualTransactionForm } from "@/components/manual-transaction-form"
import { PurchaseForm } from '@/components/purchase-form'

interface TransactionData {
  _id: string
  id: string
  description: string
  amount: number
  type: 'sale' | 'purchase'
  source?: 'square' | 'shopify' | 'gmail' | 'manual' | 'venmo'
  customer?: string
  paymentMethod?: string
  date: string
  products?: Array<{
    name: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }>
  lineItems?: Array<{
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
    }
  }>
  productsTotal?: number
  taxAmount: number
  preTaxAmount?: number
  totalAmount: number
  tip?: number
  discount?: number
  status?: 'completed' | 'cancelled' | 'refunded' | 'UNKNOWN' | 'void'
  voidReason?: string
  voidedAt?: string
  supplier?: string
  supplierOrderNumber?: string
  notes?: string
  profitCalculation?: {
    lineItemProfits: Array<{
      itemProfit: number
      itemCost: number
      quantity: number
      salePrice: number
      name: string
      hasCostData: boolean
    }>
    totalProfit: number
    totalCost: number
    totalRevenue: number
    itemsWithoutCost: number
    creditCardFees: number
  }
}

type GroupedTransactions = {
  [date: string]: {
    transactions: Array<TransactionData>
    totalAmount: number
    totalTax: number
    totalPurchases: number
    count: number
  }
}

// Helper function to calculate tax details
const calculateTaxDetails = (transaction: TransactionData) => {
  // For manual sales, always use stored MongoDB values
  if (transaction.source === 'manual') {
    return {
      taxAmount: transaction.taxAmount ?? 0,
      preTaxAmount: transaction.preTaxAmount ?? 0
    };
  }

  // For Square and Shopify, always use stored values
  if (transaction.source === 'square' || transaction.source === 'shopify') {
    return {
      taxAmount: transaction.taxAmount ?? 0,
      preTaxAmount: transaction.preTaxAmount ?? 0
    };
  }

  // For other sources, calculate if not available
  const taxAmount = transaction.taxAmount ?? 0;
  const preTaxAmount = transaction.preTaxAmount ?? 
    (transaction.amount - (transaction.taxAmount ?? 0) - (transaction.tip ?? 0));

  return { taxAmount, preTaxAmount };
};

export function TransactionsList() {
  const router = useRouter()
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const { transactions, loading, error, refreshTransactions, setTransactions } = useTransactions({
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString()
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTransaction, setEditingTransaction] = useState<TransactionData | null>(null)
  const [saving, setSaving] = useState(false)
  const [findingProduct, setFindingProduct] = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [activeForm, setActiveForm] = useState<'sale' | 'purchase' | null>(null)

  const groupedTransactions = useMemo(() => {
    // Single debug log to show what we're processing
    console.log('Processing transactions:', transactions.map(t => ({
      id: t._id,
      source: t.source,
      status: t.status,
      amount: t.amount,
      taxAmount: t.taxAmount,
      type: t.type,
      date: formatInEasternTime(toEasternTime(t.date), 'yyyy-MM-dd HH:mm:ss')
    })));

    const result = transactions.reduce<GroupedTransactions>((acc, transaction) => {
      const transactionDate = toEasternTime(transaction.date)
      const dateKey = formatInEasternTime(transactionDate, 'MMMM d, yyyy')
      const typedTransaction = transaction as unknown as TransactionData;
      const { taxAmount } = calculateTaxDetails(typedTransaction);

      if (!acc[dateKey]) {
        acc[dateKey] = {
          transactions: [],
          totalAmount: 0,
          totalTax: 0,
          totalPurchases: 0,
          count: 0
        }
      }

      acc[dateKey].transactions.push(typedTransaction)
      
      // Include in totals if:
      // 1. It's a manual transaction (we always include these unless voided)
      // 2. OR it has undefined status (we always include these too)
      // 3. OR it's a completed/UNKNOWN transaction (and not cancelled/refunded/voided)
      const isManual = typedTransaction.source === 'manual';
      const hasUndefinedStatus = typedTransaction.status === undefined;
      const isValidNonUndefinedStatus = typedTransaction.status === 'completed' || 
                                      typedTransaction.status === 'UNKNOWN';
      const isNotCancelledOrRefunded = typedTransaction.status !== 'cancelled' && 
                                     typedTransaction.status !== 'refunded';
      const isNotVoided = typedTransaction.status !== 'void' && !typedTransaction.voidedAt;
      const isPurchase = typedTransaction.type === 'purchase';

      if ((isManual || hasUndefinedStatus || (isValidNonUndefinedStatus && isNotCancelledOrRefunded)) && isNotVoided) {
        if (isPurchase) {
          acc[dateKey].totalPurchases += typedTransaction.amount;
        } else {
          acc[dateKey].totalAmount += typedTransaction.amount;
        }
        acc[dateKey].totalTax += taxAmount;
        acc[dateKey].count += 1;

        // Log when we add to totals
        console.log(`Adding to ${dateKey} totals:`, {
          id: typedTransaction._id,
          source: typedTransaction.source,
          status: typedTransaction.status,
          amount: typedTransaction.amount,
          type: typedTransaction.type,
          addedToPurchases: isPurchase,
          addedToTotal: !isPurchase
        });
      }

      return acc;
    }, {});

    // Log final daily totals
    console.log('Final daily totals:', Object.entries(result).map(([date, data]) => {
      // Use the same filtering logic as the totals calculation
      const includedTransactions = data.transactions.filter(t => {
        const isManual = t.source === 'manual';
        const hasUndefinedStatus = t.status === undefined;
        const isValidNonUndefinedStatus = t.status === 'completed' || t.status === 'UNKNOWN';
        const isNotCancelledOrRefunded = t.status !== 'cancelled' && t.status !== 'refunded';
        const isNotVoided = t.status !== 'void' && !t.voidedAt;

        return (isManual || hasUndefinedStatus || (isValidNonUndefinedStatus && isNotCancelledOrRefunded)) && isNotVoided;
      });

      return {
        date,
        totalAmount: data.totalAmount,
        totalTax: data.totalTax,
        totalPurchases: data.totalPurchases,
        count: data.count,
        includedTransactions: includedTransactions.map(t => ({
          id: t._id,
          amount: t.amount,
          taxAmount: t.taxAmount,
          source: t.source,
          status: t.status,
          isVoided: t.status === 'void' || !!t.voidedAt
        }))
      };
    }));

    return result;
  }, [transactions])

  const handleEdit = (transaction: TransactionData) => {
    setEditingId(transaction._id)
    setEditingTransaction(transaction)
  }

  const handleSave = async () => {
    if (!editingTransaction) return
    
    try {
      setSaving(true)
      const response = await fetch('/api/transactions/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editingTransaction,
          products: editingTransaction.products || []
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update transaction')
      }

      setEditingId(null)
      setEditingTransaction(null)
      refreshTransactions()
    } catch (err) {
      console.error('Failed to save transaction:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditingTransaction(null)
  }

  const handleProductQuantityChange = (productIndex: number, newQuantity: number) => {
    if (!editingTransaction?.products) return;
    
    setEditingTransaction(prev => {
      if (!prev?.products) return prev;
      
      const updatedProducts = [...prev.products];
      const product = updatedProducts[productIndex];
      
      if (!product) return prev;

      updatedProducts[productIndex] = {
        ...product,
        quantity: newQuantity,
        totalPrice: product.unitPrice * newQuantity
      };

      const newTotalAmount = updatedProducts.reduce((sum, p) => sum + p.totalPrice, 0);

      return {
        ...prev,
        products: updatedProducts,
        amount: newTotalAmount
      };
    });
  };

  const formatSource = (source: string | undefined) => {
    if (!source) return 'Unknown';
    return source.charAt(0).toUpperCase() + source.slice(1);
  }

  const handleFindMongoProduct = async (transaction: TransactionData, lineItem: NonNullable<TransactionData['lineItems']>[number], index: number) => {
    if (!lineItem.variant_id) {
      return
    }

    setFindingProduct(prev => new Set(prev).add(`${transaction._id}-${index}`))

    try {
      const response = await fetch(`/api/products/shopify/find-by-variant?variantId=${lineItem.variant_id}`)
      
      if (!response.ok) {
        throw new Error('Failed to find product')
      }

      const data = await response.json()

      if (!data.product) {
        return
      }

      // Update the transactions state directly
      const updatedTransactions = transactions.map(t => {
        if (t._id.toString() === transaction._id.toString() && t.lineItems) {
          const updatedLineItems = t.lineItems.map((item, idx) => {
            if (idx === index) {
              return {
                ...item,
                name: data.product.name,
                mongoProduct: data.product
              }
            }
            return item
          })
          
          return {
            ...t,
            lineItems: updatedLineItems
          }
        }
        return t
      })

      setTransactions(updatedTransactions)

    } catch {
      // Silently handle errors
    } finally {
      setFindingProduct(prev => {
        const next = new Set(prev)
        next.delete(`${transaction._id}-${index}`)
        return next
      })
    }
  }

  const renderProducts = (transaction: TransactionData) => {
    if (!transaction) return null;

    // First check for products array (legacy support)
    if (transaction.source === 'manual' && transaction.products && transaction.products.length > 0) {
      return transaction.products.map((product, idx) => (
        <div key={idx} className="flex items-center">
          {editingId === transaction._id ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                value={editingTransaction?.products?.[idx]?.quantity ?? product.quantity}
                onChange={(e) => {
                  const newQuantity = parseInt(e.target.value) || 1;
                  if (newQuantity < 1) return;
                  handleProductQuantityChange(idx, newQuantity);
                }}
                className="w-16 h-6 text-xs rounded border-gray-300 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="text-xs">x</span>
            </div>
          ) : (
            <span>{product.quantity}x</span>
          )}
          <span className="ml-2">{product.name}</span>
          <span className="ml-2 text-gray-500">
            (${(editingId === transaction._id && editingTransaction?.products?.[idx]?.totalPrice 
              ? editingTransaction.products[idx].totalPrice 
              : product.totalPrice).toFixed(2)})
          </span>
        </div>
      ));
    }

    // Then check for lineItems
    if (transaction.lineItems && transaction.lineItems.length > 0) {
      if (transaction.source === 'manual') {
        return transaction.lineItems.map((item, idx) => (
          <div key={idx} className="flex items-center">
            <span>{item.quantity}x</span>
            <span className="ml-2">{item.name ?? 'Unnamed Product'}</span>
            <span className="ml-2 text-gray-500">
              (${(item.price * item.quantity).toFixed(2)})
            </span>
            {item.mongoProduct && (
              <span className="ml-2 text-sm text-green-600">
                → {item.mongoProduct.name} (Stock: {item.mongoProduct.currentStock})
              </span>
            )}
          </div>
        ));
      }

      if (transaction.source === 'square') {
        return transaction.lineItems.map((item, idx) => (
          <div key={idx} className="flex items-center">
            <span>{item.quantity}x</span>
            <span className="ml-2">{item.name ?? 'Unnamed Product'}</span>
            {item.variationName && <span className="ml-1">({item.variationName})</span>}
            <span className="ml-2 text-gray-500">
              (${((item.grossSalesMoney?.amount ?? item.price * 100) / 100).toFixed(2)})
            </span>
          </div>
        ));
      }

      if (transaction.source === 'shopify') {
        return transaction.lineItems.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                <span className="font-medium">{item.quantity}x</span>
                <span className="ml-2">{item.name}</span>
                {item.sku && <span className="ml-2 text-gray-500">({item.sku})</span>}
              </div>
              <div className="text-gray-500">
                <span className="mx-1">@</span>
                <span>${Number(item.price).toFixed(2)}</span>
                <span className="mx-1">=</span>
                <span className="font-medium">${(Number(item.price) * item.quantity).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {item.mongoProduct ? (
                <div className="text-sm text-green-600">
                  → {item.mongoProduct.name} (Stock: {item.mongoProduct.currentStock})
                </div>
              ) : (
                <button
                  onClick={() => handleFindMongoProduct(transaction, item, idx)}
                  disabled={findingProduct.has(`${transaction._id}-${idx}`)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {findingProduct.has(`${transaction._id}-${idx}`) ? 'Finding...' : 'Find Product'}
                </button>
              )}
            </div>
          </div>
        ));
      }
    }

    return (
      <div className="text-gray-600 dark:text-gray-400">
        {transaction.description || 'No items'}
      </div>
    );
  };

  const renderTransactionStatus = (transaction: TransactionData) => {
    const status = transaction?.status || 'unknown';
    return (
      <span className={cn(
        "px-2 py-1 text-xs rounded",
        status === 'completed' ? "bg-green-100 text-green-700" :
        status === 'cancelled' ? "bg-red-100 text-red-700" :
        status === 'refunded' ? "bg-yellow-100 text-yellow-700" :
        "bg-gray-100 text-gray-700"
      )}>
        {status.toUpperCase()}
      </span>
    )
  }

  const handleQuickSelect = (range: string) => {
    const today = toEasternTime(new Date())
    
    switch (range) {
      case 'today':
        setStartDate(today)
        setEndDate(today)
        break
      case 'yesterday':
        setStartDate(subDays(today, 1))
        setEndDate(subDays(today, 1))
        break
      case 'lastWeek':
        setStartDate(subDays(today, 6)) // 6 days ago + today = 7 days
        setEndDate(today)
        break
      case 'thisMonth':
        setStartDate(new Date(today.getFullYear(), today.getMonth(), 1))
        setEndDate(today)
        break
      case 'lastMonth':
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
        setStartDate(lastMonth)
        setEndDate(lastDayOfLastMonth)
        break
      case 'thisYear':
        setStartDate(new Date(today.getFullYear(), 0, 1))
        setEndDate(today)
        break
      case 'allTime':
        setStartDate(undefined)
        setEndDate(undefined)
        break
      default:
        // Keep existing cases
        if (range === '1d') {
          setStartDate(subDays(today, 1))
          setEndDate(today)
        } else if (range === '2d') {
          setStartDate(subDays(today, 2))
          setEndDate(today)
        } else if (range === '7d') {
          setStartDate(subDays(today, 6))
          setEndDate(today)
        } else if (range === '30d') {
          setStartDate(subDays(today, 29))
          setEndDate(today)
        } else if (range === 'year') {
          setStartDate(startOfYear(today))
          setEndDate(today)
        }
        break
    }
    refreshTransactions()
  }

  const getActiveRange = () => {
    if (!startDate || !endDate) return 'allTime'
    const today = toEasternTime(new Date())
    const start = startOfDay(startDate)
    const end = startOfDay(endDate)

    // Today
    if (start.getTime() === end.getTime() && start.getTime() === startOfDay(today).getTime()) {
      return 'today'
    }
    
    // Yesterday
    if (start.getTime() === end.getTime() && start.getTime() === startOfDay(subDays(today, 1)).getTime()) {
      return 'yesterday'
    }
    
    // Last Week
    if (start.getTime() === startOfDay(subDays(today, 6)).getTime() && end.getTime() === startOfDay(today).getTime()) {
      return 'lastWeek'
    }
    
    // This Month
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    if (start.getTime() === startOfDay(firstDayOfMonth).getTime() && end.getTime() === startOfDay(today).getTime()) {
      return 'thisMonth'
    }
    
    // Last Month
    const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
    if (
      start.getTime() === startOfDay(firstDayOfLastMonth).getTime() && 
      end.getTime() === startOfDay(lastDayOfLastMonth).getTime()
    ) {
      return 'lastMonth'
    }
    
    // This Year
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1)
    if (start.getTime() === startOfDay(firstDayOfYear).getTime() && end.getTime() === startOfDay(today).getTime()) {
      return 'thisYear'
    }
    
    // Handle the original cases for backward compatibility
    if (start.getTime() === startOfDay(subDays(today, 1)).getTime() && end.getTime() === startOfDay(today).getTime()) {
      return '1d'
    }
    if (start.getTime() === startOfDay(subDays(today, 2)).getTime() && end.getTime() === startOfDay(today).getTime()) {
      return '2d'
    }
    if (start.getTime() === startOfDay(subDays(today, 29)).getTime() && end.getTime() === startOfDay(today).getTime()) {
      return '30d'
    }
    
    return null
  }

  const activeRange = getActiveRange()

  const handleVoidTransaction = async (transaction: TransactionData) => {
    if (!confirm('Are you sure you want to void this transaction? This will exclude it from revenue calculations.')) {
      return
    }

    try {
      const response = await fetch(`/api/transactions/${transaction._id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        throw new Error('Failed to void transaction')
      }

      refreshTransactions()
    } catch (error) {
      console.error('Error voiding transaction:', error)
    }
  }

  const handleTransactionClick = (transaction: TransactionData) => {
    router.push(`/transactions/${transaction._id}`)
  }

  const renderTransactionRow = (transaction: TransactionData) => {
    const typedTransaction = transaction as TransactionData
    // Format date for display
    const displayDate = formatInEasternTime(toEasternTime(typedTransaction.date), 'h:mm a');
    const isExpanded = expandedItems.has(typedTransaction._id);
    const toggleExpand = () => {
      const newExpandedItems = new Set(expandedItems);
      if (isExpanded) {
        newExpandedItems.delete(typedTransaction._id);
      } else {
        newExpandedItems.add(typedTransaction._id);
      }
      setExpandedItems(newExpandedItems);
    };

    return (
      <div key={typedTransaction._id} className="border-b border-gray-200 py-3 px-1 hover:bg-gray-50">
        {/* Transaction Header - Clickable to toggle details */}
        <div 
          className="flex items-center cursor-pointer"
          onClick={toggleExpand}
        >
          {/* Expand/Collapse Icon */}
          <div className="mr-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )}
          </div>

          {/* Time */}
          <div className="w-16 text-sm text-gray-500">
            {displayDate}
          </div>
          
          {/* Customer or Supplier */}
          <div className="flex-grow text-sm truncate">
            {typedTransaction.type === 'sale' ? typedTransaction.customer : typedTransaction.supplier}
          </div>

          {/* Revenue - Black text */}
          <div className="text-right font-medium mr-4">
            ${typedTransaction.amount.toFixed(2)}
          </div>

          {/* Profit - Green background if available */}
          {typedTransaction.profitCalculation && (
            <div className="min-w-[80px] text-right">
              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                ${typedTransaction.profitCalculation.totalProfit.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Expanded Details - Only when expanded */}
        {isExpanded && (
          <div className="pl-6 mt-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-gray-500">ID: {typedTransaction.id}</p>
                <p className="text-gray-500">Type: {typedTransaction.type}</p>
                {typedTransaction.paymentMethod && (
                  <p className="text-gray-500">Payment: {typedTransaction.paymentMethod}</p>
                )}
              </div>
              <div>
                <p className="text-gray-500">Source: {formatSource(typedTransaction.source)}</p>
                {typedTransaction.taxAmount > 0 && (
                  <p className="text-gray-500">Tax: ${typedTransaction.taxAmount.toFixed(2)}</p>
                )}
                {renderTransactionStatus(typedTransaction)}
              </div>
            </div>

            {/* Action Buttons */}
            {typedTransaction.source === 'manual' && (
              <div className="mt-2 flex space-x-2">
                {editingId === typedTransaction._id ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSave();
                      }}
                      disabled={saving}
                      className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancel();
                      }}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(typedTransaction);
                    }}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
                  >
                    Edit
                  </button>
                )}
                {typedTransaction.status === 'completed' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVoidTransaction(typedTransaction);
                    }}
                    className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded"
                  >
                    Void
                  </button>
                )}
              </div>
            )}

            {/* Products List - Show on expand */}
            {(typedTransaction.products || typedTransaction.lineItems) && (
              <div className="mt-2">
                <p className="text-gray-600 text-xs font-medium mb-1">Products:</p>
                {renderProducts(typedTransaction)}
              </div>
            )}

            {/* Profit Calculation - Show on expand */}
            {typedTransaction.profitCalculation && (
              <div className="mt-2 p-2 bg-gray-50 rounded">
                <div className="flex justify-between text-gray-600">
                  <span>Revenue:</span>
                  <span>${typedTransaction.profitCalculation.totalRevenue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Cost:</span>
                  <span>${typedTransaction.profitCalculation.totalCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Profit:</span>
                  <span>${typedTransaction.profitCalculation.totalProfit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Margin:</span>
                  <span>
                    {((typedTransaction.profitCalculation.totalProfit / typedTransaction.profitCalculation.totalRevenue) * 100).toFixed(1)}%
                  </span>
                </div>
                {typedTransaction.profitCalculation.itemsWithoutCost > 0 && (
                  <div className="text-yellow-600 text-xs">
                    Note: {typedTransaction.profitCalculation.itemsWithoutCost} item(s) missing cost data
                  </div>
                )}
              </div>
            )}

            {/* View Details Button */}
            <div className="mt-2">
              <button
                onClick={() => handleTransactionClick(typedTransaction)}
                className="text-xs bg-white border border-gray-200 rounded px-3 py-1 hover:bg-gray-50"
              >
                View Full Details
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg">Sales</h2>
          <div className="flex gap-2">
            <Button 
              onClick={() => setActiveForm(activeForm === 'sale' ? null : 'sale')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-violet-400 hover:bg-violet-500"
            >
              {activeForm === 'sale' ? 'Cancel' : 'Add Sale'}
            </Button>
            <Button 
              onClick={() => setActiveForm(activeForm === 'purchase' ? null : 'purchase')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-400 hover:bg-red-500"
            >
              {activeForm === 'purchase' ? 'Cancel' : 'Add Purchase'}
            </Button>
          </div>
        </div>

        {/* Form area that appears below buttons */}
        {activeForm && (
          <div className="mt-4">
            {activeForm === 'sale' ? (
              <Card className="p-4">
                <h3 className="font-medium mb-4">Add Manual Sale</h3>
                <ManualTransactionForm 
                  isExpanded={true} 
                  onSuccess={() => {
                    setActiveForm(null);
                    refreshTransactions();
                  }}
                  onCancel={() => setActiveForm(null)}
                />
              </Card>
            ) : activeForm === 'purchase' ? (
              <Card className="p-4">
                <h3 className="font-medium mb-4">Add Purchase</h3>
                <PurchaseForm 
                  isExpanded={true}
                  onSuccess={() => {
                    setActiveForm(null);
                    refreshTransactions();
                  }}
                  onCancel={() => setActiveForm(null)}
                />
              </Card>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          {/* Quick range selectors - completely new implementation */}
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'lastWeek', label: 'Last 7 Days' },
              { id: 'thisMonth', label: 'This Month' },
              { id: 'lastMonth', label: 'Last Month' },
              { id: 'thisYear', label: 'This Year' },
              { id: 'allTime', label: 'All Time' }
            ].map(range => (
              <Button 
                key={range.id}
                variant="outline" 
                size="sm" 
                onClick={() => handleQuickSelect(range.id)}
                className={activeRange === range.id ? "bg-primary-50 text-primary-700" : ""}
              >
                {range.label}
              </Button>
            ))}
          </div>

          {/* Date range picker */}
          <div className="flex gap-2 items-center ml-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  size="sm"
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PPP") : <span>Pick start date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <span className="text-sm text-gray-500">to</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  size="sm"
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "PPP") : <span>Pick end date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {loading ? (
          <div className="text-center p-4">Loading transactions...</div>
        ) : error ? (
          <div className="text-center p-4 text-red-600">Error: {error}</div>
        ) : transactions.length === 0 ? (
          <div className="text-center p-4">No transactions found.</div>
        ) : (
          <div className="mt-4 overflow-hidden">
            {/* Remove the header row completely since we don't need these labels anymore */}
            
            {/* Transaction List */}
            <div className="overflow-x-auto">
              {/* Group by date sections */}
              {Object.entries(groupedTransactions).map(([date, group]) => (
                <div key={date} className="mb-4">
                  <div className="flex justify-between items-center py-2 px-4 bg-gray-50 rounded-t border-b border-gray-200">
                    <h3 className="font-medium">{date}</h3>
                    <div className="flex gap-4 text-sm">
                      <span className="text-gray-600">
                        Sales: ${group.totalAmount.toFixed(2)}
                      </span>
                      <span className="text-gray-600">
                        Purchases: ${group.totalPurchases.toFixed(2)}
                      </span>
                      <span className="text-gray-600">
                        ({group.count} transactions)
                      </span>
                    </div>
                  </div>

                  {/* List of transactions for this date */}
                  <div className="rounded-b border border-gray-200 divide-y divide-gray-100">
                    {group.transactions.map(transaction => renderTransactionRow(transaction))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
} 