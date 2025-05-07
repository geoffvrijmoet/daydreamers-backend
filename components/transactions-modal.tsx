'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HomeSyncButton } from './home-sync-button'
import { formatInEasternTime } from '@/lib/utils/dates'

interface Transaction {
  _id: string
  date: string
  type: 'sale' | 'expense' | 'training'
  amount: number
  customer?: string
  description?: string
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
  }>
  source: 'manual' | 'shopify' | 'square' | 'amex'
  paymentMethod?: string
  isTaxable?: boolean
  preTaxAmount?: number
  taxAmount?: number
  tip?: number
  discount?: number
  shipping?: number
}

type TransactionsModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TransactionsModal({ open, onOpenChange }: TransactionsModalProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchTransactions()
    }
  }, [open])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/transactions?limit=1000')
      if (!response.ok) throw new Error('Failed to fetch transactions')
      const data = await response.json()
      setTransactions(data.transactions)
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  // Group transactions by date
  const groupedTransactions = transactions.reduce((groups, transaction) => {
    // Format the date once and store both the display format and the group key
    const easternDate = formatInEasternTime(transaction.date, 'yyyy-MM-dd')
    const displayDate = formatInEasternTime(transaction.date, 'MMMM d, yyyy')
    
    if (!groups[easternDate]) {
      groups[easternDate] = {
        displayDate,
        transactions: []
      }
    }
    groups[easternDate].transactions.push(transaction)
    return groups
  }, {} as Record<string, { displayDate: string, transactions: Transaction[] }>)

  // Calculate daily totals
  const dailyTotals = Object.entries(groupedTransactions).reduce((totals, [date, group]) => {
    const dayStats = group.transactions.reduce((acc, t) => {
      // Ensure all values are numeric
      const amount = typeof t.amount === 'number' ? t.amount : 0;
      const preTaxAmount = typeof t.preTaxAmount === 'number' ? t.preTaxAmount : 0;
      const taxAmount = typeof t.taxAmount === 'number' ? t.taxAmount : 0;
      
      // Only add to revenue if it's not an expense
      if (t.type !== 'expense') {
        acc.revenue += amount;
      }

      // These seem specific to sales, keep as is
      acc.preTaxAmount += preTaxAmount;
      acc.salesTax += taxAmount;
      
      // Only count sales tax from manual transactions (not Square/Shopify)
      if (t.source === 'manual' && taxAmount) {
        acc.nonPlatformSalesTax += taxAmount;
      }
      return acc;
    }, { revenue: 0, preTaxAmount: 0, salesTax: 0, nonPlatformSalesTax: 0 });
    
    totals[date] = dayStats;
    return totals;
  }, {} as Record<string, { revenue: number, preTaxAmount: number, salesTax: number, nonPlatformSalesTax: number }>);

  // Helper function to safely format numbers
  const formatCurrency = (value: number | undefined | null): string => {
    if (typeof value !== 'number' || isNaN(value)) {
      return '0.00';
    }
    return value.toFixed(2);
  };

  // Delete transaction handler
  const handleDeleteTransaction = async (transactionId: string) => {
    if (deletingId) return; // Prevent multiple deletes

    if (window.confirm('Are you sure you want to delete this transaction?')) {
      setDeletingId(transactionId);
      try {
        const response = await fetch(`/api/transactions/${transactionId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Failed to delete transaction' }));
          throw new Error(errorData.message || 'Failed to delete transaction');
        }

        // Remove transaction from local state for immediate UI update
        setTransactions(prev => prev.filter(t => t._id !== transactionId));

        // You might want to use a notification library here (like sonner, react-toastify)
        alert('Transaction deleted successfully!'); // Placeholder for toast

      } catch (error) {
        console.error('Error deleting transaction:', error);
        alert(`Error: ${error instanceof Error ? error.message : 'Could not delete transaction'}`); // Placeholder for toast
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Transactions</DialogTitle>
          <HomeSyncButton />
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedTransactions)
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([date, group]) => (
                <div key={date} className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">
                      {group.displayDate}
                    </h3>
                    <div className="text-right text-sm">
                      <div className="text-gray-900">
                        Revenue: ${formatCurrency(dailyTotals[date]?.revenue)}
                        {dailyTotals[date]?.preTaxAmount > 0 && (
                          <span className="text-gray-500">
                            {' '}(Sales: ${formatCurrency(dailyTotals[date]?.preTaxAmount)})
                          </span>
                        )}
                      </div>
                      {dailyTotals[date]?.salesTax > 0 && (
                        <div className="text-gray-500">
                          Sales Tax: ${formatCurrency(dailyTotals[date]?.salesTax)}
                          {dailyTotals[date]?.nonPlatformSalesTax > 0 && (
                            <span>
                              {' '}(Non-platform: ${formatCurrency(dailyTotals[date]?.nonPlatformSalesTax)})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {group.transactions.map((transaction) => (
                      <div
                        key={transaction._id}
                        className="flex items-start justify-between p-3 rounded-lg group"
                        style={{ backgroundColor: transaction.type === 'expense' ? '#FEE2E2' /* bg-red-100 */ : '#F9FAFB' /* bg-gray-50 */ }}
                      >
                        <div className="space-y-1 flex-grow pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {transaction.customer || 
                               (transaction.type === 'expense' ? 'Expense' : 
                                transaction.type === 'training' ? 'Training Session' : null)
                              }
                              {/* Add a badge for Sale type */}
                              {transaction.type === 'sale' && (
                                <span className="ml-2 px-1.5 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                  Sale
                                </span>
                              )}
                            </span>
                            <span className="text-sm text-gray-500">
                              {formatInEasternTime(transaction.date, 'h:mm a')}
                            </span>
                          </div>
                          {transaction.description && (
                            <p className="text-sm text-gray-600">{transaction.description}</p>
                          )}
                          {transaction.products && (
                            <ul className="text-sm text-gray-600">
                              {transaction.products.map((product, index) => (
                                <li key={index}>
                                  {product.quantity}x {product.name} - ${formatCurrency(product.totalPrice)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-medium">${formatCurrency(transaction.amount)}</div>
                          
                          {/* Conditionally render Tip div */}
                          {typeof transaction.tip === 'number' && transaction.tip > 0 && (
                            <div className="text-sm text-gray-500">
                              Tip: ${formatCurrency(transaction.tip)}
                            </div>
                          )}
                          
                          {/* Conditionally render Tax div */}
                          {typeof transaction.taxAmount === 'number' && transaction.taxAmount > 0 && (
                            <div className="text-sm text-gray-500">
                              Tax: ${formatCurrency(transaction.taxAmount)}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteTransaction(transaction._id)}
                          disabled={deletingId === transaction._id}
                          className={`ml-4 p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-100 
                                      opacity-0 group-hover:opacity-100 transition-opacity duration-150
                                      ${deletingId === transaction._id ? 'cursor-not-allowed opacity-100' : ''}`}
                          aria-label="Delete transaction"
                        >
                          {deletingId === transaction._id ? (
                            <svg className="animate-spin h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
} 