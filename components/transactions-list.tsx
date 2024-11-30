'use client'

import { Card } from "@/components/ui/card"
import { useTransactions } from "@/lib/hooks/useTransactions"
import { useMemo, useState, useEffect } from "react"

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
  const { transactions, loading, error, refreshTransactions } = useTransactions()
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
      <div className="flex-shrink-0 ml-4 px-3 py-2 border border-cyan-600 bg-black/50 rounded">
        <div className="flex flex-col gap-1 text-xs">
          {transaction.source === 'manual' && transaction.productsTotal && (
            <>
              <div className="text-green-400">
                Products: ${transaction.productsTotal.toFixed(2)}
              </div>
              {transaction.discount && (
                <div className="text-red-400">
                  Discount: -${transaction.discount.toFixed(2)}
                </div>
              )}
              <div className="text-green-400">
                Tax ({taxRate}%): ${taxAmount.toFixed(2)}
              </div>
              {transaction.tip && (
                <div className="text-cyan-400">
                  Tip: +${transaction.tip.toFixed(2)}
                </div>
              )}
            </>
          )}
          <div className="font-bold text-cyan-400">
            Total: ${transaction.amount.toFixed(2)}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="p-6 font-mono border-2 border-cyan-500 bg-black text-green-400">
        <h2 className="text-lg font-bold text-cyan-400 mb-4 uppercase tracking-wider">
          == Recent Transactions ==
        </h2>
        <div className="max-h-[400px] overflow-auto pr-2">
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="sticky top-0 z-10 bg-black py-1">
                <div className="flex flex-col pb-1 border-b border-cyan-600">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-cyan-400">
                      [Loading...]
                    </h3>
                    <div className="text-sm">
                      <span className="text-green-400">
                        Loading transactions...
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <div className="space-x-4">
                      <span className="text-green-400">
                        Total: $0.00
                      </span>
                      <span className="text-green-400">
                        Tax: $0.00
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="p-6 font-mono border-2 border-cyan-500 bg-black text-green-400">
        <h2 className="text-lg font-bold text-cyan-400 mb-4 uppercase tracking-wider">
          == Recent Transactions ==
        </h2>
        <div className="max-h-[400px] overflow-auto pr-2">
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="sticky top-0 z-10 bg-black py-1">
                <div className="flex flex-col pb-1 border-b border-cyan-600">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-cyan-400">
                      [Error]
                    </h3>
                    <div className="text-sm">
                      <span className="text-red-400">
                        Error: {error.message}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <div className="space-x-4">
                      <span className="text-green-400">
                        Total: $0.00
                      </span>
                      <span className="text-green-400">
                        Tax: $0.00
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6 font-mono border-2 border-cyan-500 bg-black text-green-400">
      <h2 className="text-lg font-bold text-cyan-400 mb-4 uppercase tracking-wider">
        == Recent Transactions ==
      </h2>
      <div className="max-h-[400px] overflow-auto pr-2">
        <div className="space-y-4">
          {Object.entries(groupedTransactions)
            .sort(([dateA], [dateB]) => 
              new Date(dateB).getTime() - new Date(dateA).getTime()
            )
            .map(([date, { transactions, totalAmount, totalTax, count }]) => (
              <div key={date} className="space-y-1">
                <div className="sticky top-0 z-10 bg-black py-1">
                  <div className="flex flex-col pb-1 border-b border-cyan-600">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-cyan-400">
                        [{date}]
                      </h3>
                      <div className="text-sm">
                        <span className="text-green-400">
                          {count} transaction{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <div className="space-x-4">
                        <span className="text-green-400">
                          Total: ${totalAmount.toFixed(2)}
                        </span>
                        <span className="text-green-400">
                          Tax: ${totalTax.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {transactions.map((transaction) => (
                    <div 
                      key={transaction.id} 
                      className="relative p-2 border border-cyan-600 bg-black/50 rounded hover:border-cyan-400 transition-colors"
                    >
                      <div className="flex gap-4">
                        <div className="flex-grow">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-base font-bold text-cyan-400">
                              > ${transaction.amount.toFixed(2)}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-900 text-cyan-400 uppercase">
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
      </div>
    </Card>
  )
} 