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
import { ManualTransactionForm } from "@/components/manual-transaction-form"
import { PurchaseForm } from '@/components/purchase-form'
import { TrainingForm } from '@/components/training-form'

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
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const { transactions, loading, error, refreshTransactions } = useTransactions({
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString()
  })
  const [activeForm, setActiveForm] = useState<'sale' | 'purchase' | 'training' | null>(null)

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

  const renderTransactionRow = (transaction: TransactionData) => {
    const { statusClasses, statusText } = getStatusDisplay(transaction);
    const formattedDate = formatTransactionDate(transaction.date, true);
    
    // Define the icon based on transaction type
    let typeIcon = '💰';
    
    if (transaction.type === 'purchase') {
      typeIcon = '🛒';
    } else if (transaction.type === 'training') {
      typeIcon = '🐕';
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
    
    // Return the row JSX
    return (
      <div className="p-3 hover:bg-gray-50">
        <div className="flex justify-between">
          <div className="flex gap-2 items-center">
            <span className="text-lg">{typeIcon}</span>
            <div>
              <div className="font-medium">{transaction.customer || transaction.clientName || transaction.supplier || 'Unknown'}</div>
              <div className="text-sm text-gray-500">{formattedDate} - {displayDescription}</div>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="font-semibold">${transaction.amount.toFixed(2)}</div>
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
        )}
      </div>
    </Card>
  )
} 