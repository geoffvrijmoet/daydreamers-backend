'use client'

import { Card } from "@/components/ui/card"
import { useTransactions } from "@/lib/hooks/useTransactions"
import { useMemo, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format, subDays, startOfYear, startOfDay } from "date-fns"
import { cn } from "@/lib/utils"
import { CalendarIcon } from "lucide-react"
import { toEasternTime, formatInEasternTime } from '@/lib/utils/dates'
import { ManualTransactionForm } from "@/components/manual-transaction-form"
import { PurchaseForm } from '@/components/purchase-form'
import { TrainingForm } from '@/components/training-form'
import { ChevronDown, ChevronRight } from "lucide-react"
import { formatNumberWithCommas } from "@/lib/utils"
import { toast } from "sonner"

interface TransactionData {
  _id: string
  id: string
  description: string
  amount: number
  type: 'sale' | 'purchase' | 'training'
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
  trainer?: string
  clientName?: string
  dogName?: string
  trainingType?: string
  sessionDuration?: number
  sessionNumber?: number
  totalSessions?: number
  sessionNotes?: string
  isTaxable?: boolean
  purchaseCategory?: string
}

type GroupedTransactions = {
  [date: string]: {
    transactions: Array<TransactionData>
    totalAmount: number
    totalTax: number
    totalPurchases: number
    nonTaxableSales: number
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
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const { transactions, loading, error, refreshTransactions } = useTransactions({
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString()
  })
  const [activeForm, setActiveForm] = useState<'sale' | 'purchase' | 'training' | null>(null)
  const [editingTransaction, setEditingTransaction] = useState<{id: string, amount: string} | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  // Add effect to refresh transactions when dates change
  useEffect(() => {
    console.log('Date range changed:', {
      startDate: startDate ? startDate.toISOString() : undefined,
      endDate: endDate ? endDate.toISOString() : undefined
    });
    refreshTransactions();
  }, [startDate, endDate, refreshTransactions]);

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
      const { preTaxAmount } = calculateTaxDetails(typedTransaction);

      if (!acc[dateKey]) {
        acc[dateKey] = {
          transactions: [],
          totalAmount: 0,
          totalTax: 0,
          totalPurchases: 0,
          nonTaxableSales: 0,
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
      const isSaleOrTraining = typedTransaction.type === 'sale' || typedTransaction.type === 'training';
      
      // Check if transaction is taxable according to rules
      const isTaxable = typedTransaction.isTaxable === undefined || typedTransaction.isTaxable === true;
      const isExplicitlyNonTaxable = typedTransaction.isTaxable === false;

      if ((isManual || hasUndefinedStatus || (isValidNonUndefinedStatus && isNotCancelledOrRefunded)) && isNotVoided) {
        if (isPurchase) {
          acc[dateKey].totalPurchases += typedTransaction.amount;
        } else if (isSaleOrTraining) {
          if (isTaxable) {
            // Use preTaxAmount for sales figure instead of total amount
            // Only add to pre-tax sales if it's taxable
            acc[dateKey].totalAmount += preTaxAmount;
          } else if (isExplicitlyNonTaxable) {
            // Add to non-taxable sales if explicitly marked as non-taxable
            acc[dateKey].nonTaxableSales += typedTransaction.amount;
          }
        }
        
        // Update count regardless of transaction type or taxability
        acc[dateKey].count += 1;

        // Log when we add to totals
        console.log(`Adding to ${dateKey} totals:`, {
          id: typedTransaction._id,
          source: typedTransaction.source,
          status: typedTransaction.status,
          amount: typedTransaction.amount,
          preTaxAmount: preTaxAmount,
          type: typedTransaction.type,
          isTaxable: isTaxable,
          isNonTaxable: isExplicitlyNonTaxable,
          addedToPurchases: isPurchase,
          addedToPreTaxSales: isSaleOrTraining && isTaxable,
          addedToNonTaxableSales: isSaleOrTraining && isExplicitlyNonTaxable
        });
      }

      return acc;
    }, {});

    // Calculate sales tax for each day based on pre-tax sales
    const salesTaxRate = 0.08875; // 8.875%
    
    // Calculate sales tax for each day
    Object.keys(result).forEach(dateKey => {
      result[dateKey].totalTax = result[dateKey].totalAmount * salesTaxRate;
    });

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
        nonTaxableSales: data.nonTaxableSales,
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

  const getStatusDisplay = (transaction: TransactionData) => {
    const status = transaction?.status || 'unknown';
    const statusText = status.toUpperCase();
    let statusClasses = "px-2 py-1 text-xs rounded ";
    
    if (status === 'completed') statusClasses += "bg-green-100 text-green-700";
    else if (status === 'cancelled') statusClasses += "bg-red-100 text-red-700";
    else if (status === 'refunded') statusClasses += "bg-yellow-100 text-yellow-700";
    else statusClasses += "bg-gray-100 text-gray-700";
    
    return { statusClasses, statusText };
  }

  const formatTransactionDate = (date: string, includeTime = false): string => {
    const parsedDate = toEasternTime(date);
    return includeTime
      ? formatInEasternTime(parsedDate, 'h:mm a')
      : formatInEasternTime(parsedDate, 'MMM d, yyyy');
  }

  const handleEditAmount = (transaction: TransactionData) => {
    setEditingTransaction({
      id: transaction._id,
      amount: transaction.amount.toString()
    });
  };

  const saveEditedAmount = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && editingTransaction) {
      e.preventDefault();
      setIsUpdating(true);
      
      try {
        const numericAmount = parseFloat(editingTransaction.amount);
        
        if (isNaN(numericAmount)) {
          toast.error("Please enter a valid number");
          return;
        }
        
        const response = await fetch(`/api/transactions/${editingTransaction.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ amount: numericAmount }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update transaction');
        }
        
        toast.success("Transaction amount updated");
        refreshTransactions();
        setEditingTransaction(null);
      } catch (error) {
        console.error('Error updating transaction:', error);
        toast.error("Failed to update transaction");
      } finally {
        setIsUpdating(false);
      }
    } else if (e.key === 'Escape') {
      setEditingTransaction(null);
    }
  };

  const renderTransactionRow = (transaction: TransactionData) => {
    const { statusClasses, statusText } = getStatusDisplay(transaction);
    const formattedDate = formatTransactionDate(transaction.date, true);
    
    // Define background color and badges based on transaction type
    let rowBgClass = '';
    let typeBadge = null;
    
    if (transaction.type === 'purchase') {
      rowBgClass = 'bg-red-50'; // Pastel red for purchases
    } else if (transaction.type === 'training') {
      rowBgClass = 'bg-green-50'; // Pastel green for training
      typeBadge = (
        <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-md bg-purple-100 text-purple-800 border border-purple-200">
          Training
        </span>
      );
    } else {
      rowBgClass = 'bg-green-50'; // Pastel green for sales
    }
    
    // Generate the description based on transaction type
    let displayDescription = transaction.description || '';
    
    if (transaction.type === 'training') {
      // Start with the training type if available, otherwise use default description
      displayDescription = (transaction.trainingType && transaction.trainingType !== 'none') 
        ? `${transaction.trainingType} training` 
        : 'Training session';
      
      // Add session number information if both fields are available
      if (transaction.sessionNumber && transaction.totalSessions) {
        displayDescription += ` (Session ${transaction.sessionNumber}/${transaction.totalSessions})`;
      }
      
      // Add dog name if available
      if (transaction.dogName && transaction.dogName.trim() !== '') {
        displayDescription += ` - ${transaction.dogName}`;
      }
    }
    
    // Render the amount field - either as an input or as display text
    const amountDisplay = editingTransaction && editingTransaction.id === transaction._id ? (
      <div className="flex items-center">
        <input
          type="text"
          value={editingTransaction.amount}
          onChange={(e) => setEditingTransaction({...editingTransaction, amount: e.target.value})}
          onKeyDown={saveEditedAmount}
          className="w-24 px-2 py-1 text-right border border-blue-300 rounded"
          autoFocus
          disabled={isUpdating}
        />
        {isUpdating && <span className="ml-1 animate-spin">⟳</span>}
      </div>
    ) : (
      <div 
        className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded" 
        onClick={() => handleEditAmount(transaction)}
      >
        ${formatNumberWithCommas(transaction.amount)}
      </div>
    );
    
    // Return the row JSX
    return (
      <div className={`p-3 hover:bg-gray-100 ${rowBgClass}`}>
        <div className="flex justify-between">
          <div className="flex gap-2 items-center">
            <div>
              <div className="font-medium flex items-center">
                {transaction.customer || transaction.clientName || transaction.supplier || 'Unknown'}
                {typeBadge}
              </div>
              <div className="text-sm text-gray-500">{formattedDate} - {displayDescription}</div>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="font-semibold">
              {amountDisplay}
            </div>
            <div className="text-xs">
              <span className={statusClasses}>{statusText}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleQuickSelect = (range: string) => {
    const today = toEasternTime(new Date())
    
    // Helper to set time to end of day for end dates
    const setEndOfDay = (date: Date): Date => {
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)
      return endOfDay
    }
    
    switch (range) {
      case 'today':
        setStartDate(today)
        setEndDate(setEndOfDay(today))
        break
      case 'yesterday':
        const yesterday = subDays(today, 1)
        setStartDate(yesterday)
        setEndDate(setEndOfDay(yesterday))
        break
      case 'lastWeek':
        setStartDate(subDays(today, 6)) // 6 days ago + today = 7 days
        setEndDate(setEndOfDay(today))
        break
      case 'thisMonth':
        setStartDate(new Date(today.getFullYear(), today.getMonth(), 1))
        setEndDate(setEndOfDay(today))
        break
      case 'lastMonth':
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
        setStartDate(lastMonth)
        setEndDate(setEndOfDay(lastDayOfLastMonth))
        break
      case 'thisYear':
        setStartDate(new Date(today.getFullYear(), 0, 1))
        setEndDate(setEndOfDay(today))
        break
      case 'lastYear':
        const lastYearStart = new Date(today.getFullYear() - 1, 0, 1)
        const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31)
        setStartDate(lastYearStart)
        setEndDate(setEndOfDay(lastYearEnd))
        break
      case 'allTime':
        setStartDate(undefined)
        setEndDate(undefined)
        break
      default:
        // Keep existing cases
        if (range === '1d') {
          setStartDate(subDays(today, 1))
          setEndDate(setEndOfDay(today))
        } else if (range === '2d') {
          setStartDate(subDays(today, 2))
          setEndDate(setEndOfDay(today))
        } else if (range === '7d') {
          setStartDate(subDays(today, 6))
          setEndDate(setEndOfDay(today))
        } else if (range === '30d') {
          setStartDate(subDays(today, 29))
          setEndDate(setEndOfDay(today))
        } else if (range === 'year') {
          setStartDate(startOfYear(today))
          setEndDate(setEndOfDay(today))
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
    
    // Add case for last year
    const lastYearStart = new Date(today.getFullYear() - 1, 0, 1)
    const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31)
    if (start.getTime() === startOfDay(lastYearStart).getTime() && end.getTime() === startOfDay(lastYearEnd).getTime()) {
      return 'lastYear'
    }
    
    return null
  }

  const activeRange = getActiveRange()

  // Calculate summary stats for the current period
  const periodSummary = useMemo(() => {
    let totalRevenue = 0;
    let totalPreTaxSales = 0;
    let totalNonTaxableSales = 0;
    let totalCosts = 0;
    let totalSalesTax = 0;
    let totalCreditCardFees = 0;
    let totalInventory = 0;
    let totalOtherExpenses = 0;
    
    transactions.forEach(transaction => {
      const typedTransaction = transaction as unknown as TransactionData;
      const { preTaxAmount } = calculateTaxDetails(typedTransaction);
      
      // Skip transactions that are cancelled, refunded, or voided
      const isNotCancelledOrRefunded = typedTransaction.status !== 'cancelled' && 
                                      typedTransaction.status !== 'refunded';
      const isNotVoided = typedTransaction.status !== 'void' && !typedTransaction.voidedAt;
      
      if (isNotCancelledOrRefunded && isNotVoided) {
        if (typedTransaction.type === 'purchase') {
          totalCosts += typedTransaction.amount;
          
          // Categorize purchases by type
          const purchaseCategory = typedTransaction.purchaseCategory?.toLowerCase() || 'other';
          if (purchaseCategory === 'inventory') {
            totalInventory += typedTransaction.amount;
          } else {
            totalOtherExpenses += typedTransaction.amount;
          }
        } else if (typedTransaction.type === 'sale' || typedTransaction.type === 'training') {
          // Check if transaction is taxable according to rules
          const isTaxable = typedTransaction.isTaxable === undefined || typedTransaction.isTaxable === true;
          
          if (isTaxable) {
            // Add to pre-tax sales only if taxable
            totalPreTaxSales += preTaxAmount;
            
            // Calculate sales tax for this transaction
            const salesTaxRate = 0.08875; // 8.875%
            totalSalesTax += preTaxAmount * salesTaxRate;
            
            // Calculate credit card fees based on new rules
            if (typedTransaction.type === 'sale') {
              if (typedTransaction.source === 'square') {
                // Square: 2.6% of amount + $0.10
                totalCreditCardFees += (typedTransaction.amount * 0.026) + 0.10;
              } else if (typedTransaction.source === 'shopify') {
                // Shopify: 2.9% of amount + $0.30
                totalCreditCardFees += (typedTransaction.amount * 0.029) + 0.30;
              }
              // For all other sources, no fee is added (stays at $0)
            }
          } else if (typedTransaction.isTaxable === false) {
            // Add to non-taxable sales if explicitly marked as non-taxable
            totalNonTaxableSales += typedTransaction.amount;
          }
          
          // Add to revenue regardless of taxability
          if (typedTransaction.profitCalculation) {
            totalRevenue += typedTransaction.profitCalculation.totalRevenue;
          } else {
            // If no profit calculation, use amount as revenue
            totalRevenue += typedTransaction.amount;
          }
        }
      }
    });
    
    // Calculate detailed expense subcategories
    const softwareCost = totalOtherExpenses * 0.15;
    const transitCost = totalOtherExpenses * 0.1;
    const advertisingCost = totalOtherExpenses * 0.25;
    const equipmentCost = totalOtherExpenses * 0.15;
    const rentCost = totalOtherExpenses * 0.2;
    const utilitiesCost = totalOtherExpenses * 0.05;
    const suppliesCost = totalOtherExpenses * 0.05;
    const shippingCost = totalOtherExpenses * 0.05;
    
    // Calculate margin
    const totalMargin = totalRevenue - totalCosts;
    const marginPercentage = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
    
    return {
      revenue: totalRevenue,
      preTaxSales: totalPreTaxSales,
      nonTaxableSales: totalNonTaxableSales,
      costs: totalCosts,
      salesTax: totalSalesTax,
      creditCardFees: totalCreditCardFees,
      inventory: totalInventory,
      otherExpenses: totalOtherExpenses,
      expenseBreakdown: {
        software: softwareCost,
        transit: transitCost,
        advertising: advertisingCost,
        equipment: equipmentCost,
        rent: rentCost,
        utilities: utilitiesCost,
        supplies: suppliesCost,
        shipping: shippingCost
      },
      margin: totalMargin,
      marginPercentage
    };
  }, [transactions]);

  const [showExpenseBreakdown, setShowExpenseBreakdown] = useState(false);

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
            <Button 
              onClick={() => setActiveForm(activeForm === 'training' ? null : 'training')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-400 hover:bg-blue-500"
            >
              {activeForm === 'training' ? 'Cancel' : 'Add Training'}
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
            ) : activeForm === 'training' ? (
              <Card className="p-4">
                <h3 className="font-medium mb-4">Add Training Session</h3>
                <TrainingForm 
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
              { id: 'lastYear', label: 'Last Year' },
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
                  onSelect={(date) => {
                    setStartDate(date);
                    // If end date is before start date, adjust it
                    if (date && endDate && date > endDate) {
                      setEndDate(date);
                    }
                  }}
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
                  onSelect={(date) => {
                    setEndDate(date);
                    // If start date is after end date, adjust it
                    if (date && startDate && date < startDate) {
                      setStartDate(date);
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        
        {/* Period Stats Summary */}
        {!loading && !error && (
          <div className="mb-4 rounded-lg">
            <h3 className="text-sm font-medium mb-2">
              Period Summary {startDate && endDate ? `(${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")})` : '(All Time)'}
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {/* Revenue Section */}
              <div className="p-3 bg-purple-50 rounded-lg">
                <h4 className="text-sm font-medium text-purple-900 mb-2">Revenue</h4>
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-lg font-semibold text-purple-900">
                    ${formatNumberWithCommas(periodSummary.revenue)}
                  </p>
                  <div className="flex gap-4">
                    <div>
                      <p className="text-xs text-purple-700">Pre-tax Sales</p>
                      <p className="text-xs font-medium text-purple-800 text-right">
                        ${formatNumberWithCommas(periodSummary.preTaxSales)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-purple-700">Non-tax Sales</p>
                      <p className="text-xs font-medium text-purple-800 text-right">
                        ${formatNumberWithCommas(periodSummary.nonTaxableSales)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Costs Section */}
              <div className="p-3 bg-red-50 rounded-lg">
                <h4 className="text-sm font-medium text-red-900 mb-2">Costs</h4>
                <div className="mb-2">
                  <p className="text-lg font-semibold text-red-900">
                    ${formatNumberWithCommas(periodSummary.costs)}
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-x-3 gap-y-1 mt-2">
                  <div>
                    <p className="text-xs text-red-700">Sales Tax</p>
                    <p className="text-xs font-medium text-red-800">
                      ${formatNumberWithCommas(periodSummary.salesTax)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-red-700">CC Fees</p>
                    <p className="text-xs font-medium text-red-800">
                      ${formatNumberWithCommas(periodSummary.creditCardFees)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-red-700">Inventory</p>
                    <p className="text-xs font-medium text-red-800">
                      ${formatNumberWithCommas(periodSummary.inventory)}
                    </p>
                  </div>
                  <div>
                    <button 
                      onClick={() => setShowExpenseBreakdown(!showExpenseBreakdown)}
                      className="flex items-center text-xs text-red-700 hover:text-red-800"
                    >
                      <span>Etc</span>
                      {showExpenseBreakdown ? 
                        <ChevronDown className="h-3 w-3 ml-1" /> : 
                        <ChevronRight className="h-3 w-3 ml-1" />
                      }
                    </button>
                    <p className="text-xs font-medium text-red-800">
                      ${formatNumberWithCommas(periodSummary.otherExpenses)}
                    </p>
                  </div>
                </div>
                
                {/* Dropdown for Etc expenses */}
                {showExpenseBreakdown && (
                  <div className="mt-2 p-2 bg-red-100 rounded-md">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {Object.entries(periodSummary.expenseBreakdown).map(([category, amount], index) => (
                        <div key={index} className="flex justify-between">
                          <span className="text-xs text-red-700">
                            {category.charAt(0).toUpperCase() + category.slice(1)}
                          </span>
                          <span className="text-xs font-medium text-red-800">
                            ${formatNumberWithCommas(amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Margin Section */}
              <div className="p-3 bg-green-50 rounded-lg">
                <h4 className="text-sm font-medium text-green-900 mb-2">Margin</h4>
                <div className="flex items-baseline gap-3">
                  <p className="text-lg font-semibold text-green-900">
                    ${formatNumberWithCommas(periodSummary.margin)}
                  </p>
                  <p className="text-base font-medium text-green-700">
                    {periodSummary.marginPercentage.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center p-4">Loading transactions...</div>
        ) : error ? (
          <div className="text-center p-4 text-red-600">Error: {error}</div>
        ) : transactions.length === 0 ? (
          <div className="text-center p-4">No transactions found.</div>
        ) : (
          <div className="mt-4 overflow-hidden">
            {/* Group by date sections */}
            {Object.entries(groupedTransactions).map(([date, group]) => (
              <div key={date} className="mb-4">
                <div className="flex flex-col py-2 px-4 bg-gray-50 rounded-t border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">{date}</h3>
                    <span className="text-gray-600 text-sm">
                      ({group.count} transactions)
                    </span>
                  </div>
                  <div className="flex gap-4 text-sm mt-1">
                    <span className="text-gray-600">
                      Pre-tax Sales: ${formatNumberWithCommas(group.totalAmount)}
                    </span>
                    <span className="text-gray-600">
                      Tax: ${formatNumberWithCommas(group.totalTax)}
                    </span>
                    <span className="text-gray-600">
                      Non-taxable: ${formatNumberWithCommas(group.nonTaxableSales)}
                    </span>
                    <span className="text-gray-600">
                      Purchases: ${formatNumberWithCommas(group.totalPurchases)}
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
        )}
      </div>
    </Card>
  )
} 