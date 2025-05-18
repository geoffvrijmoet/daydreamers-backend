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

// Add some custom styles for animations
const fadeInAnimation = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .animate-fade-in {
    animation: fadeIn 0.3s ease-in;
  }
`;

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
  profitCalculation?: {
    lastCalculatedAt: string
    totalCost: number
    totalProfit: number
    profitMargin: number
    hasCostData: boolean
    items: Array<{
      productId: string
      quantity: number
      itemName: string
      costBasis: number
      totalCost: number
      totalPrice: number
      profit: number
      profitMargin: number
    }>
  }
}

type TransactionsModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TransactionsModal({ open, onOpenChange }: TransactionsModalProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [calculatingProfitId, setCalculatingProfitId] = useState<string | null>(null);
  const [successMessageIds, setSuccessMessageIds] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    if (open) {
      fetchTransactions()
    }
  }, [open])

  // Clear success messages after 3 seconds
  useEffect(() => {
    const successIds = Object.keys(successMessageIds);
    if (successIds.length > 0) {
      const timer = setTimeout(() => {
        // Create a new object without the current success messages
        const clearedMessages: {[key: string]: boolean} = {};
        setSuccessMessageIds(clearedMessages);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessageIds]);

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

      // Add profit calculation if it exists for sale transactions
      if (t.type === 'sale' && t.profitCalculation && typeof t.profitCalculation.totalProfit === 'number') {
        acc.totalProfit += t.profitCalculation.totalProfit;
        acc.hasProfitData = true;
      }

      return acc;
    }, { revenue: 0, preTaxAmount: 0, salesTax: 0, nonPlatformSalesTax: 0, totalProfit: 0, hasProfitData: false });
    
    totals[date] = dayStats;
    return totals;
  }, {} as Record<string, { revenue: number, preTaxAmount: number, salesTax: number, nonPlatformSalesTax: number, totalProfit: number, hasProfitData: boolean }>);

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

        // Show success message on this transaction (it will be removed automatically)
        const updatedSuccessIds = { ...successMessageIds };
        updatedSuccessIds[transactionId] = true;
        setSuccessMessageIds(updatedSuccessIds);

      } catch (error) {
        console.error('Error deleting transaction:', error);
        // Show error inline instead of alert
        const updatedSuccessIds = { ...successMessageIds };
        updatedSuccessIds[transactionId] = false; // false means error
        setSuccessMessageIds(updatedSuccessIds);
      } finally {
        setDeletingId(null);
      }
    }
  };

  // Refresh profit calculation
  const handleRefreshProfit = async (transactionId: string) => {
    if (calculatingProfitId) return; // Prevent multiple calculation

    setCalculatingProfitId(transactionId);
    try {
      const response = await fetch(`/api/transactions/${transactionId}/profit`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to calculate profit' }));
        throw new Error(errorData.message || 'Failed to calculate profit');
      }

      const responseData = await response.json();
      console.log('[CLIENT] Profit calculation result:', responseData);
      
      // Update the transaction in local state if we received valid profit data
      if (responseData.success && responseData.profitCalculation) {
        setTransactions(prev => prev.map(t => 
          t._id === transactionId ? { 
            ...t, 
            profitCalculation: responseData.profitCalculation 
          } : t
        ));

        // Show success message for this transaction
        const updatedSuccessIds = { ...successMessageIds };
        updatedSuccessIds[transactionId] = true;
        setSuccessMessageIds(updatedSuccessIds);
      } else {
        // Handle case where response is ok but data is invalid
        console.error('[CLIENT] Invalid profit calculation data:', responseData);
        const updatedSuccessIds = { ...successMessageIds };
        updatedSuccessIds[transactionId] = false;
        setSuccessMessageIds(updatedSuccessIds);
      }
    } catch (error) {
      console.error('Error calculating profit:', error);
      // Show error inline instead of alert
      const updatedSuccessIds = { ...successMessageIds };
      updatedSuccessIds[transactionId] = false; // false means error
      setSuccessMessageIds(updatedSuccessIds);
    } finally {
      setCalculatingProfitId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <style dangerouslySetInnerHTML={{ __html: fadeInAnimation }} />
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
                      {dailyTotals[date]?.hasProfitData && (
                        <div className={
                          dailyTotals[date]?.totalProfit >= 0 
                            ? "text-green-600" 
                            : "text-red-600"
                        }>
                          Profit: ${formatCurrency(dailyTotals[date]?.totalProfit)}
                          {dailyTotals[date]?.preTaxAmount > 0 && (
                            <span className="text-gray-500">
                              {' '}({(dailyTotals[date]?.totalProfit / dailyTotals[date]?.preTaxAmount * 100).toFixed(1)}%)
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
                              {/* Add payment source/method badge */}
                              {transaction.type === 'sale' && (
                                <span className="ml-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800 border border-gray-200">
                                  {transaction.source === 'square' ? 'Square' :
                                   transaction.source === 'shopify' ? 'Shopify' :
                                   transaction.paymentMethod === 'Venmo' ? 'Venmo' :
                                   transaction.paymentMethod === 'Zelle' ? 'Zelle' :
                                   transaction.paymentMethod === 'Cash App' ? 'Cash App' :
                                   transaction.paymentMethod === 'Cash' ? 'Cash' : 'Manual'}
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
                          
                          {/* Display profit calculation for sales */}
                          {transaction.type === 'sale' && transaction.profitCalculation && (
                            <div className="mt-2 text-sm">
                              <div className={
                                typeof transaction.profitCalculation.totalProfit === 'number' && 
                                transaction.profitCalculation.totalProfit >= 0 
                                  ? "text-green-600" 
                                  : "text-red-600"
                              }>
                                Profit: ${formatCurrency(transaction.profitCalculation.totalProfit)} 
                                ({typeof transaction.profitCalculation.profitMargin === 'number' 
                                    ? transaction.profitCalculation.profitMargin.toFixed(1) 
                                    : '0.0'}%)
                                {typeof transaction.profitCalculation.hasCostData === 'boolean' && 
                                 !transaction.profitCalculation.hasCostData && (
                                  <span className="text-amber-500 ml-2">⚠️ Incomplete cost data</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">
                                Last calculated: {transaction.profitCalculation.lastCalculatedAt 
                                  ? formatInEasternTime(transaction.profitCalculation.lastCalculatedAt, 'MMM d, yyyy h:mm a')
                                  : 'N/A'}
                              </div>
                            </div>
                          )}
                          
                          {/* Success/error messages for the transaction */}
                          {successMessageIds[transaction._id] === true && (
                            <div className="mt-1 text-sm text-green-600 font-medium animate-fade-in">
                              ✓ Profit calculation updated
                            </div>
                          )}
                          {successMessageIds[transaction._id] === false && (
                            <div className="mt-1 text-sm text-red-600 font-medium animate-fade-in">
                              ✗ Failed to update profit calculation
                            </div>
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
                          
                          {/* Add refresh button for sales */}
                          {transaction.type === 'sale' && (
                            <button
                              onClick={() => handleRefreshProfit(transaction._id)}
                              disabled={calculatingProfitId === transaction._id}
                              className={`mt-2 text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100
                                        ${calculatingProfitId === transaction._id ? 'opacity-70 cursor-wait' : ''}`}
                              title="Recalculate profit based on current product costs"
                            >
                              {calculatingProfitId === transaction._id ? (
                                <span className="flex items-center">
                                  <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Calculating...
                                </span>
                              ) : (
                                <>Refresh profit</>
                              )}
                            </button>
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