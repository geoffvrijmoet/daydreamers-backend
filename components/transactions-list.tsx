'use client'

import { Card } from "@/components/ui/card"
import { useTransactions } from "@/lib/hooks/useTransactions"
import { useMemo, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { CalendarIcon } from "lucide-react"
import { addDays, subDays, startOfYear, startOfDay } from 'date-fns'

type Transaction = {
  id: string
  description: string
  amount: number
  type: 'sale' | 'purchase'
  source?: 'square' | 'shopify' | 'gmail' | 'manual'
  customer?: string
  paymentMethod?: string
  date: string
  products?: Array<{
    name: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }>
  productsTotal?: number
  tip?: number
  discount?: number
}

type GroupedTransactions = {
  [date: string]: {
    transactions: Array<{
      id: string
      description: string
      amount: number
      type: 'sale' | 'purchase'
      source?: 'square' | 'shopify' | 'gmail' | 'manual'
      customer?: string
      paymentMethod?: string
      date: string
      products?: Array<{
        name: string
        quantity: number
        unitPrice: number
        totalPrice: number
      }>
      productsTotal?: number
      tip?: number
      discount?: number
    }>
    totalAmount: number
    totalTax: number
    count: number
  }
}

export function TransactionsList() {
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const { transactions, loading, error, refreshTransactions } = useTransactions({
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString()
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    transactions.forEach(transaction => {
      if (transaction.products?.length) {
        console.log(`Products for transaction ${transaction.id}:`, {
          date: transaction.date,
          description: transaction.description,
          products: transaction.products.map(p => ({
            name: p.name,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            totalPrice: p.totalPrice
          }))
        })
      }
    })
  }, [transactions])

  const calculateTaxDetails = (transaction: Transaction) => {
    const taxRate = 0.08875;
    
    // If this is a manual transaction with products
    if (transaction.source === 'manual' && transaction.productsTotal !== undefined) {
      // For discounts, use the actual amount paid (minus any tip)
      const baseAmount = transaction.amount - (transaction.tip || 0);
      const preTaxAmount = baseAmount / (1 + taxRate);
      const taxAmount = baseAmount - preTaxAmount;
      
      return {
        preTaxAmount,
        taxAmount,
        taxRate: taxRate * 100
      };
    }
    
    // For non-manual transactions or those without products, use original calculation
    const preTaxAmount = transaction.amount / (1 + taxRate);
    const taxAmount = transaction.amount - preTaxAmount;
    return {
      preTaxAmount,
      taxAmount,
      taxRate: taxRate * 100
    };
  };

  const groupedTransactions = useMemo(() => {
    return transactions.reduce((acc: GroupedTransactions, transaction) => {
      const transactionDate = new Date(transaction.date)
      const dateKey = transactionDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/New_York'
      })

      if (!acc[dateKey]) {
        acc[dateKey] = {
          transactions: [],
          totalAmount: 0,
          totalTax: 0,
          count: 0
        }
      }

      // Calculate tax for this transaction
      const { taxAmount } = calculateTaxDetails(transaction);

      acc[dateKey].transactions.push(transaction)
      acc[dateKey].totalAmount += transaction.amount
      acc[dateKey].totalTax += taxAmount
      acc[dateKey].count += 1

      return acc
    }, {})
  }, [transactions])

  const handleEdit = (transaction: Transaction) => {
    setEditingId(transaction.id)
    setEditingTransaction({
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      customer: transaction.customer,
      paymentMethod: transaction.paymentMethod,
      date: transaction.date,
      products: transaction.products
    })
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

  const renderProducts = (transaction: Transaction) => {
    if (!transaction) return null;

    if (transaction.source === 'manual' && transaction.products?.length > 0) {
      return transaction.products.map((product, idx) => (
        <div key={idx} className="flex items-center">
          {editingId === transaction.id ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                value={editingTransaction?.products?.[idx]?.quantity || product.quantity}
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
            (${(editingId === transaction.id ? 
              editingTransaction?.products?.[idx]?.totalPrice : 
              product.totalPrice).toFixed(2)})
          </span>
        </div>
      ));
    }

    if (transaction.source === 'square' && transaction.lineItems?.length > 0) {
      return transaction.lineItems.map((item: any, idx: number) => (
        <div key={idx} className="flex items-center">
          <span>{item.quantity}x</span>
          <span className="ml-2">{item.name}</span>
          {item.variationName && <span className="ml-1">({item.variationName})</span>}
          <span className="ml-2 text-gray-500">
            (${(item.grossSalesMoney.amount / 100).toFixed(2)})
          </span>
        </div>
      ));
    }

    if (transaction.source === 'shopify' && transaction.line_items?.length > 0) {
      return transaction.line_items.map((item: any, idx: number) => (
        <div key={idx} className="flex items-center">
          <span>{item.quantity}x</span>
          <span className="ml-2">{item.title}</span>
          <span className="ml-2 text-gray-500">
            (${(parseFloat(item.price) * item.quantity).toFixed(2)})
          </span>
        </div>
      ));
    }

    return (
      <div className="text-gray-600 dark:text-gray-400">
        {transaction.description}
      </div>
    );
  };

  const renderTransactionDetails = (transaction: Transaction) => {
    const { preTaxAmount, taxAmount, taxRate } = calculateTaxDetails(transaction);

    return (
      <div className="flex-shrink-0 ml-4 px-3 py-2 border border-purple-light bg-purple-pastel/50 rounded">
        <div className="flex flex-col gap-1 text-xs">
          {transaction.source === 'manual' && transaction.productsTotal && (
            <>
              <div className="text-green-dark">
                Products: ${transaction.productsTotal.toFixed(2)}
              </div>
              {transaction.discount && (
                <div className="text-red-dark">
                  Discount: -${transaction.discount.toFixed(2)}
                </div>
              )}
              <div className="text-green-dark">
                Tax ({taxRate}%): ${taxAmount.toFixed(2)}
              </div>
              {transaction.tip && (
                <div className="text-purple-dark">
                  Tip: +${transaction.tip.toFixed(2)}
                </div>
              )}
            </>
          )}
          <div className="font-bold text-purple-dark">
            Total: ${transaction.amount.toFixed(2)}
          </div>
        </div>
      </div>
    );
  };

  const handleQuickSelect = (range: string) => {
    const today = new Date()
    
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
    const today = new Date()
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

          {/* Date selectors */}
          <div className="flex gap-2 ml-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal w-[120px] px-2",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-1 h-4 w-4" />
                  {startDate ? format(startDate, "MMM d, yyyy") : <span>Start</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    setStartDate(date)
                    refreshTransactions()
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal w-[120px] px-2",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-1 h-4 w-4" />
                  {endDate ? format(endDate, "MMM d, yyyy") : <span>End</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => {
                    setEndDate(date)
                    refreshTransactions()
                  }}
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
          <p className="text-red-600">Error: {error.message}</p>
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
        <div className="space-y-6">
          {Object.entries(groupedTransactions)
            .sort(([dateA], [dateB]) => 
              new Date(dateB).getTime() - new Date(dateA).getTime()
            )
            .map(([date, { transactions, totalAmount, totalTax, count }]) => (
              <div key={date} className="space-y-2">
                <div className="border-b border-gray-200 pb-2">
                  <div className="flex justify-between">
                    <h3 className="text-sm">{date}</h3>
                    <span className="text-sm text-gray-600">
                      {count} transaction{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    <span className="mr-4">Total: ${totalAmount.toFixed(2)}</span>
                    <span>Tax: ${totalTax.toFixed(2)}</span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {transactions.map((transaction) => (
                    <div 
                      key={transaction.id} 
                      className="p-4 border border-gray-200 rounded"
                    >
                      <div className="flex gap-4">
                        <div className="flex-grow">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-base font-bold text-purple-dark">
                              ${transaction.amount.toFixed(2)}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-pastel text-purple-dark uppercase">
                              {transaction.source?.charAt(0).toUpperCase() + transaction.source?.slice(1)}
                            </span>
                            {transaction.source === 'manual' && (
                              <div className="flex gap-2">
                                {editingId === transaction.id ? (
                                  <>
                                    <button
                                      onClick={handleSave}
                                      disabled={saving}
                                      className="text-xs text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                                    >
                                      {saving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      onClick={handleCancel}
                                      className="text-xs text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => handleEdit(transaction)}
                                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="text-xs space-y-0.5">
                            {renderProducts(transaction)}
                          </div>

                          <div className="flex flex-wrap gap-x-3 text-xs text-gray-600 dark:text-gray-400 mt-2">
                            {transaction.customer && (
                              <span>
                                Customer: {transaction.customer}
                              </span>
                            )}
                            {transaction.paymentMethod && (
                              <span>
                                Via: {transaction.paymentMethod}
                              </span>
                            )}
                          </div>
                        </div>

                        {renderTransactionDetails(transaction)}
                      </div>
                      <div className="text-sm">
                        <div className="flex justify-between">
                          <span>Products Total:</span>
                          <span>${transaction.productsTotal?.toFixed(2)}</span>
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
                        <div className="flex justify-between font-medium">
                          <span>Final Amount:</span>
                          <span>${transaction.amount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </Card>
  )
} 