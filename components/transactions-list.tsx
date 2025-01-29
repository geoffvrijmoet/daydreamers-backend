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

  const groupedTransactions = useMemo(() => {
    // Single debug log to show what we're processing
    console.log('Processing transactions:', transactions.map(t => ({
      id: t._id,
      source: t.source,
      status: t.status,
      amount: t.amount,
      taxAmount: t.taxAmount,
      date: formatInEasternTime(toEasternTime(t.date), 'yyyy-MM-dd HH:mm:ss')
    })));

    const result = transactions.reduce((acc: GroupedTransactions, transaction) => {
      const transactionDate = toEasternTime(transaction.date)
      const dateKey = formatInEasternTime(transactionDate, 'MMMM d, yyyy')
      const typedTransaction = transaction as unknown as TransactionData;
      const { taxAmount } = calculateTaxDetails(typedTransaction);

      if (!acc[dateKey]) {
        acc[dateKey] = {
          transactions: [],
          totalAmount: 0,
          totalTax: 0,
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

      if ((isManual || hasUndefinedStatus || (isValidNonUndefinedStatus && isNotCancelledOrRefunded)) && isNotVoided) {
        acc[dateKey].totalAmount += typedTransaction.amount
        acc[dateKey].totalTax += taxAmount
        acc[dateKey].count += 1

        // Log when we add to totals
        console.log(`Adding to ${dateKey} totals:`, {
          id: typedTransaction._id,
          source: typedTransaction.source,
          status: typedTransaction.status,
          amount: typedTransaction.amount,
          taxAmount,
          isVoided: typedTransaction.status === 'void' || !!typedTransaction.voidedAt,
          newTotalAmount: acc[dateKey].totalAmount,
          newTotalTax: acc[dateKey].totalTax
        });
      }

      return acc
    }, {})

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
      case '1d':
        setStartDate(subDays(today, 1))
        setEndDate(today)
        break
      case '2d':
        setStartDate(subDays(today, 2))
        setEndDate(today)
        break
      case '7d':
        setStartDate(subDays(today, 6)) // 6 days ago + today = 7 days
        setEndDate(today)
        break
      case '30d':
        setStartDate(subDays(today, 29)) // 29 days ago + today = 30 days
        setEndDate(today)
        break
      case 'year':
        setStartDate(startOfYear(today))
        setEndDate(today)
        break
    }
    refreshTransactions()
  }

  const getActiveRange = () => {
    if (!startDate || !endDate) return null
    const today = toEasternTime(new Date())
    const start = startOfDay(startDate)
    const end = startOfDay(endDate)

    if (start.getTime() === end.getTime() && start.getTime() === startOfDay(today).getTime()) {
      return 'today'
    }
    if (start.getTime() === startOfDay(subDays(today, 1)).getTime() && end.getTime() === startOfDay(today).getTime()) {
      return '1d'
    }
    if (start.getTime() === startOfDay(subDays(today, 2)).getTime() && end.getTime() === startOfDay(today).getTime()) {
      return '2d'
    }
    if (start.getTime() === startOfDay(subDays(today, 6)).getTime() && end.getTime() === startOfDay(today).getTime()) {
      return '7d'
    }
    if (start.getTime() === startOfDay(subDays(today, 29)).getTime() && end.getTime() === startOfDay(today).getTime()) {
      return '30d'
    }
    if (start.getTime() === startOfDay(startOfYear(today)).getTime() && end.getTime() === startOfDay(today).getTime()) {
      return 'year'
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
    const typedTransaction = transaction as unknown as TransactionData;
    const isInactive = typedTransaction.status === 'cancelled' || typedTransaction.status === 'refunded';
    const isExpanded = expandedItems.has(typedTransaction._id);
    const hasProfitData = typedTransaction.profitCalculation?.totalProfit !== undefined;

    return (
      <div 
        key={typedTransaction._id}
        className={cn(
          "border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer",
          isInactive && "opacity-60"
        )}
      >
        {/* Main Row */}
        <div 
          className="flex items-center justify-between py-2 px-4"
          onClick={() => {
            const next = new Set(expandedItems);
            if (isExpanded) {
              next.delete(typedTransaction._id);
            } else {
              next.add(typedTransaction._id);
            }
            setExpandedItems(next);
          }}
        >
          <div className="flex items-center gap-3">
            {/* Expand/Collapse Icon */}
            <div className="text-gray-400">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>
            
            {/* Amount */}
            <span className={cn(
              "font-medium",
              isInactive && "line-through"
            )}>
              ${typedTransaction.amount.toFixed(2)}
            </span>

            {/* Profit (if available) */}
            {hasProfitData && (
              <span className={cn(
                "text-sm",
                typedTransaction.profitCalculation!.totalProfit >= 0 ? "text-green-600" : "text-red-600"
              )}>
                (${typedTransaction.profitCalculation!.totalProfit.toFixed(2)})
              </span>
            )}

            {/* Source Badge */}
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
              {formatSource(typedTransaction.source)}
            </span>

            {/* Status Badge (if not completed) */}
            {renderTransactionStatus(typedTransaction)}
          </div>

          {/* Right side info */}
          <div className="flex items-center gap-4">
            {/* Time */}
            <span className="text-sm text-gray-500">
              {new Date(typedTransaction.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>

            {/* Actions */}
            <div className="flex gap-2">
              {typedTransaction.source === 'manual' && (
                <>
                  {editingId === typedTransaction._id ? (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSave();
                        }}
                        disabled={saving}
                        className="text-xs text-green-600 hover:text-green-700"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancel();
                        }}
                        className="text-xs text-gray-600 hover:text-gray-700"
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
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      Edit
                    </button>
                  )}
                </>
              )}
              {typedTransaction.status === 'completed' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleVoidTransaction(typedTransaction);
                  }}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Void
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-11 pb-3" onClick={(e) => e.stopPropagation()}>
            {/* Products/Line Items */}
            <div className="text-sm space-y-1 mb-2">
              {renderProducts(typedTransaction)}
            </div>

            {/* Profit Details (if available) */}
            {hasProfitData && (
              <div className="mt-2 text-sm space-y-1">
                <div className="flex justify-between text-gray-600">
                  <span>Revenue:</span>
                  <span>${typedTransaction.profitCalculation!.totalRevenue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Cost:</span>
                  <span>${typedTransaction.profitCalculation!.totalCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Profit:</span>
                  <span className={typedTransaction.profitCalculation!.totalProfit >= 0 ? "text-green-600" : "text-red-600"}>
                    ${typedTransaction.profitCalculation!.totalProfit.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Margin:</span>
                  <span>
                    {((typedTransaction.profitCalculation!.totalProfit / typedTransaction.profitCalculation!.totalRevenue) * 100).toFixed(1)}%
                  </span>
                </div>
                {typedTransaction.profitCalculation!.itemsWithoutCost > 0 && (
                  <div className="text-yellow-600 text-xs">
                    Note: {typedTransaction.profitCalculation!.itemsWithoutCost} item(s) missing cost data
                  </div>
                )}
              </div>
            )}

            {/* Additional Details */}
            <div className="flex flex-wrap gap-x-4 text-xs text-gray-600 mt-2">
              {typedTransaction.customer && (
                <span>Customer: {typedTransaction.customer}</span>
              )}
              {typedTransaction.paymentMethod && (
                <span>Via: {typedTransaction.paymentMethod}</span>
              )}
            </div>

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
        <h2 className="text-lg">Sales</h2>
        
        <div className="flex flex-wrap items-center gap-4">
          {/* Quick select buttons */}
          <div className="flex flex-wrap gap-1">
            <Button 
              variant={activeRange === 'year' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleQuickSelect('year')}
            >
              This Year
            </Button>
            <Button 
              variant={activeRange === '30d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleQuickSelect('30d')}
            >
              Last 30d
            </Button>
            <Button 
              variant={activeRange === '7d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleQuickSelect('7d')}
            >
              Last 7d
            </Button>
            <Button 
              variant={activeRange === '2d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleQuickSelect('2d')}
            >
              2d ago
            </Button>
            <Button 
              variant={activeRange === '1d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleQuickSelect('1d')}
            >
              1d ago
            </Button>
            <Button 
              variant={activeRange === 'today' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleQuickSelect('today')}
            >
              Today
            </Button>
          </div>

          {/* Date Range Picker */}
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
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
            <span>to</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
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
            <Button 
              variant="outline"
              onClick={() => {
                setStartDate(undefined)
                setEndDate(undefined)
                refreshTransactions()
              }}
              className="px-2"
            >
              Clear
            </Button>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="p-4 border border-red-200 rounded mb-4">
          <p className="text-red-600">Error: {typeof error === 'string' ? error : (error as Error).message}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div 
              key={i}
              className="h-16 bg-gray-50 rounded animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div>
          {Object.entries(groupedTransactions)
            .sort(([dateA], [dateB]) => 
              new Date(dateB).getTime() - new Date(dateA).getTime()
            )
            .map(([date, { transactions: dayTransactions }]): JSX.Element => {
              // Use the same filtering logic as the groupedTransactions calculation
              const includedTransactions = dayTransactions.filter(t => {
                const isManual = t.source === 'manual';
                const hasUndefinedStatus = t.status === undefined;
                const isValidNonUndefinedStatus = t.status === 'completed' || t.status === 'UNKNOWN';
                const isNotCancelledOrRefunded = t.status !== 'cancelled' && t.status !== 'refunded';
                const isNotVoided = t.status !== 'void' && !t.voidedAt;

                return (isManual || hasUndefinedStatus || (isValidNonUndefinedStatus && isNotCancelledOrRefunded)) && isNotVoided;
              });

              const totalAmount = includedTransactions.reduce((sum, t) => sum + t.amount, 0)
              const totalTax = includedTransactions.reduce((sum, t) => sum + calculateTaxDetails(t).taxAmount, 0)

              return (
                <div key={date}>
                  {/* Date Header */}
                  <div className="sticky top-0 bg-white border-b border-gray-200 py-2 px-4">
                    <div className="flex justify-between">
                      <h3 className="text-sm font-medium">{date}</h3>
                      <div className="text-sm text-gray-600">
                        <span className="mr-4">Total: ${totalAmount.toFixed(2)}</span>
                        <span>Tax: ${totalTax.toFixed(2)}</span>
                        <span className="ml-4">
                          {includedTransactions.length} transaction{includedTransactions.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Transactions */}
                  <div>
                    {dayTransactions.map(transaction => renderTransactionRow(transaction))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </Card>
  )
} 