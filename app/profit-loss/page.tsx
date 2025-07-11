'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNumberWithCommas } from "@/lib/utils"
import { Loader2, ChevronDown, ChevronRight, Check, RefreshCw } from "lucide-react"
import { toEasternTime, formatInEasternTime } from '@/lib/utils/dates'
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format, subDays } from "date-fns"
import { cn } from "@/lib/utils"
import { CalendarIcon } from "lucide-react"

interface Transaction {
  _id: string
  date: string
  amount: number
  type: 'sale' | 'expense' | 'training'
  vendor?: string
  supplier?: string
  description?: string
  paymentMethod?: string
  purchaseCategory?: string
  expenseType?: string
  supplierOrderNumber?: string
  preTaxAmount?: number
  taxAmount?: number
  isTaxable?: boolean
  source: 'manual' | 'shopify' | 'square' | 'amex'
  // Training-specific fields
  clientName?: string
  dogName?: string
  trainer?: string
  trainingAgency?: string
  revenue?: number
  // Payment processing fees (already stored in MongoDB)
  paymentProcessing?: {
    fee: number
    provider: string
    transactionId?: string
  }
  // Sale-specific fields
  customer?: string
}

interface CategoryGroup {
  name: string
  transactions: Transaction[]
  subtotal: number
}

interface RevenueBreakdown {
  retail: {
    revenue: number
    sales: number
    taxable: number
    tax: number
  }
  training: {
    revenue: number
    sales: number
    taxable: number
    tax: number
  }
  total: {
    revenue: number
    sales: number
    taxable: number
    tax: number
  }
}

export default function ProfitLossPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [revenueBreakdown, setRevenueBreakdown] = useState<RevenueBreakdown>({
    retail: { revenue: 0, sales: 0, taxable: 0, tax: 0 },
    training: { revenue: 0, sales: 0, taxable: 0, tax: 0 },
    total: { revenue: 0, sales: 0, taxable: 0, tax: 0 }
  })
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const [activeRange, setActiveRange] = useState<string>('allTime')
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['all']))
  const [loadingProgress, setLoadingProgress] = useState<string>('')
  const [isClient, setIsClient] = useState(false)
  const [editingExpenseTypes, setEditingExpenseTypes] = useState<Record<string, string>>({})
  const [updatingTransactions, setUpdatingTransactions] = useState<Set<string>>(new Set())
  const [successTransactions, setSuccessTransactions] = useState<Set<string>>(new Set())
  const [syncingTransactions, setSyncingTransactions] = useState<Set<string>>(new Set())
  const [savingTaxData, setSavingTaxData] = useState<Set<string>>(new Set())
  const [syncingRevenue, setSyncingRevenue] = useState<Set<string>>(new Set())
  const [fetchingFees, setFetchingFees] = useState<Set<string>>(new Set())
  const [ccFeeTransactions, setCcFeeTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (isClient) {
      fetchTransactions()
    }
  }, [startDate, endDate, isClient])

  // Process transactions into category groups and calculate revenue breakdown
  useEffect(() => {
    if (transactions.length === 0) {
      setCategoryGroups([])
      setCcFeeTransactions([])
      setRevenueBreakdown({
        retail: { revenue: 0, sales: 0, taxable: 0, tax: 0 },
        training: { revenue: 0, sales: 0, taxable: 0, tax: 0 },
        total: { revenue: 0, sales: 0, taxable: 0, tax: 0 }
      })
      return
    }

    // Create category groups for expenses
    const groups = new Map<string, CategoryGroup>()
    
    // Get Square/Shopify transactions for CC fees section
    const ccTransactions = transactions.filter(t => 
      (t.type === 'sale' || t.type === 'training') && 
      (t.source === 'square' || t.source === 'shopify')
    )
    setCcFeeTransactions(ccTransactions)
    
    // Calculate revenue breakdown
    const breakdown = transactions.reduce((acc, t) => {
      if (t.type === 'sale') {
        // For retail sales - ensure numbers
        const preTaxAmount = Number(t.preTaxAmount) || 0
        const taxAmount = Number(t.taxAmount) || 0
        const amount = Number(t.amount) || 0
        const isTaxable = t.isTaxable !== false // Default to true if undefined
        
        acc.retail.revenue += amount
        acc.retail.sales += preTaxAmount
        acc.retail.tax += taxAmount
        
        // Only include in taxable if isTaxable is true
        if (isTaxable) {
          acc.retail.taxable += preTaxAmount
        }
      } else if (t.type === 'training') {
        // For training - ensure numbers
        const preTaxAmount = Number(t.preTaxAmount) || 0
        const taxAmount = Number(t.taxAmount) || 0
        const amount = Number(t.amount) || 0
        
        acc.training.revenue += amount
        acc.training.sales += preTaxAmount
        acc.training.tax += taxAmount
        
        // Only include in taxable if taxAmount > 0 (meaning it has tax)
        if (taxAmount > 0) {
          acc.training.taxable += preTaxAmount
        }
      }
      
      return acc
    }, {
      retail: { revenue: 0, sales: 0, taxable: 0, tax: 0 },
      training: { revenue: 0, sales: 0, taxable: 0, tax: 0 },
      total: { revenue: 0, sales: 0, taxable: 0, tax: 0 }
    })
    
    // Calculate totals
    breakdown.total.revenue = breakdown.retail.revenue + breakdown.training.revenue
    breakdown.total.sales = breakdown.retail.sales + breakdown.training.sales
    breakdown.total.taxable = breakdown.retail.taxable + breakdown.training.taxable
    breakdown.total.tax = breakdown.retail.tax + breakdown.training.tax
    
    setRevenueBreakdown(breakdown)
    
    // Process expense transactions into category groups
    transactions.forEach(transaction => {
      if (transaction.type !== 'expense') return
      
      const categoryName = transaction.purchaseCategory 
        ? (transaction.purchaseCategory.charAt(0).toUpperCase() + transaction.purchaseCategory.slice(1))
        : "Uncategorized"
      
      if (!groups.has(categoryName)) {
        groups.set(categoryName, {
          name: categoryName,
          transactions: [],
          subtotal: 0
        })
      }
      
      const group = groups.get(categoryName)!
      group.transactions.push(transaction)
      group.subtotal += Number(transaction.amount) || 0
    })
    
         // Add Credit Card Transaction Fees as a special category
     const ccFeeTotal = ccTransactions.reduce((sum, t) => {
       const fee = t.paymentProcessing?.fee || 0
       return sum + fee
     }, 0)
    
    if (ccFeeTotal > 0 || ccTransactions.length > 0) {
      groups.set('Credit Card Transaction Fees', {
        name: 'Credit Card Transaction Fees',
        transactions: [], // We'll handle this specially
        subtotal: ccFeeTotal
      })
    }
    
    // Convert Map to Array and sort by amount (descending)
    const sortedGroups = Array.from(groups.values())
      .sort((a, b) => b.subtotal - a.subtotal)
    
    setCategoryGroups(sortedGroups)
    
    // Recalculate total amount to include credit card fees
    const expenseTotal = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    const totalWithFees = expenseTotal + ccFeeTotal;
    setTotalAmount(totalWithFees)
  }, [transactions])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      setLoadingProgress('Initializing...')
      setError(null)
      
      // Construct the base query URL with date parameters if present
      let baseUrl = '/api/transactions'
      if (startDate) {
        baseUrl += `?startDate=${startDate.toISOString()}`
      }
      if (endDate) {
        baseUrl += `${startDate ? '&' : '?'}endDate=${endDate.toISOString()}`
      }
      
      // Determine appropriate limit based on date range
      let limit = 100; // Default limit
      
      // Calculate date range in days
      if (startDate && endDate) {
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Adjust limit based on date range
        if (diffDays > 365) {
          limit = 500; // For year+ ranges
        } else if (diffDays > 90) {
          limit = 300; // For quarter+ ranges
        } else if (diffDays > 30) {
          limit = 200; // For month+ ranges
        }
      } else if (activeRange === 'allTime') {
        limit = 500; // For all time
      }
      
      // Add limit parameter to base URL
      baseUrl += `${baseUrl.includes('?') ? '&' : '?'}limit=${limit}`
      
      // Initialize variables for pagination
      let allTransactions: Transaction[] = [];
      let hasMore = true;
      let page = 0;
      
      // Fetch all pages of transactions
      while (hasMore) {
        setLoadingProgress(`Fetching page ${page + 1}...`);
        
        // Add skip parameter for pagination
        const url = `${baseUrl}&skip=${page * limit}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error('Failed to fetch transactions');
        }
        
        const data = await response.json();
        const pageTransactions = data.transactions as Transaction[];
        
        // Add transactions from this page to our collection
        allTransactions = [...allTransactions, ...pageTransactions];
        
        // If we got fewer transactions than the limit, we've reached the end
        if (pageTransactions.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
        
        // Safety check to prevent infinite loops
        if (page > 20) {
          console.warn('Reached maximum page limit (20), stopping pagination');
          hasMore = false;
        }
      }
      
      setLoadingProgress('Processing transactions...');
      
      // Calculate total expenses including credit card fees
      const expenseTotal = allTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      
      // Calculate credit card fees from Square/Shopify transactions
      const ccFeeTotal = allTransactions
        .filter(t => (t.type === 'sale' || t.type === 'training') && (t.source === 'square' || t.source === 'shopify'))
        .reduce((sum, t) => {
          const fee = t.paymentProcessing?.fee || 0
          return sum + fee
        }, 0);
      
      const totalExpenses = expenseTotal + ccFeeTotal;
      
      setTransactions(allTransactions);
      setTotalAmount(totalExpenses);
      setLoadingProgress('');
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }

  // Format transaction date
  const formatTransactionDate = (date: string | undefined | null): string => {
    if (!date) {
      console.warn('Invalid date provided to formatTransactionDate:', date)
      return 'Invalid Date'
    }
    
    // Additional validation for the date string
    if (typeof date !== 'string' || date.trim() === '') {
      console.warn('Invalid date string provided to formatTransactionDate:', date)
      return 'Invalid Date'
    }
    
    try {
      const parsedDate = toEasternTime(date)
      return formatInEasternTime(parsedDate, 'MMM d, yyyy')
    } catch (error) {
      console.error('Error formatting date:', date, error)
      return 'Invalid Date'
    }
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
        const currentYear = toEasternTime(new Date()).getFullYear()
        const lastYearStart = new Date(currentYear - 1, 0, 1)
        const lastYearEnd = new Date(currentYear - 1, 11, 31)
        setStartDate(lastYearStart)
        setEndDate(setEndOfDay(lastYearEnd))
        break
      case 'allTime':
        setStartDate(undefined)
        setEndDate(undefined)
        break
      default:
        // Keep existing date range
        break
    }
    
    setActiveRange(range)
  }

  // Toggle category expansion
  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(categoryName)) {
        newExpanded.delete(categoryName)
      } else {
        newExpanded.add(categoryName)
      }
      return newExpanded
    })
  }

  // Expand or collapse all categories
  const toggleAllCategories = () => {
    if (expandedCategories.has('all')) {
      // Collapse all
      setExpandedCategories(new Set())
    } else {
      // Expand all
      const allCategories = new Set(['all'])
      categoryGroups.forEach(group => {
        allCategories.add(group.name)
      })
      setExpandedCategories(allCategories)
    }
  }

  // Tax calculation functions (from new-transaction-modal)
  const TAX_RATE = 0.08875

  const computeFromRevenue = (revenue: number, hasAgency: boolean) => {
    if (hasAgency) {
      return { sale: revenue, tax: 0 }
    }
    // Revenue includes tax, so sale = revenue / (1 + TAX_RATE)
    const sale = revenue / (1 + TAX_RATE)
    const tax = revenue - sale
    return { 
      sale: parseFloat(sale.toFixed(2)), 
      tax: parseFloat(tax.toFixed(2)) 
    }
  }

  // Sync revenue to amount field
  const syncRevenueToAmount = async (transactionId: string, revenueValue: number) => {
    setSyncingRevenue(prev => new Set(prev).add(transactionId))
    
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: revenueValue
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to sync revenue to amount')
      }
      
      // Update local state
      setTransactions(prev => 
        prev.map(t => 
          t._id === transactionId 
            ? { ...t, amount: revenueValue }
            : t
        )
      )
      
    } catch (error) {
      console.error('Error syncing revenue to amount:', error)
      alert('Failed to sync revenue to amount')
    } finally {
      setSyncingRevenue(prev => {
        const newSet = new Set(prev)
        newSet.delete(transactionId)
        return newSet
      })
    }
  }

  // Save tax data to transaction
  const saveTaxData = async (transactionId: string, revenue: number, sale: number, taxAmount: number) => {
    setSavingTaxData(prev => new Set(prev).add(transactionId))
    
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          revenue,
          preTaxAmount: sale,
          taxAmount
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to save tax data')
      }
      
      // Update local state
      setTransactions(prev => 
        prev.map(t => 
          t._id === transactionId 
            ? { ...t, revenue, preTaxAmount: sale, taxAmount }
            : t
        )
      )
      
      alert('Tax data saved successfully!')
      
    } catch (error) {
      console.error('Error saving tax data:', error)
      alert('Failed to save tax data')
    } finally {
      setSavingTaxData(prev => {
        const newSet = new Set(prev)
        newSet.delete(transactionId)
        return newSet
      })
    }
  }

  // TaxCell component for training transactions
  const TaxCell = ({ transaction }: { transaction: Transaction }) => {
    const hasAgency = !!(transaction.trainingAgency && transaction.trainingAgency.trim() !== '')
    const isSaving = savingTaxData.has(transaction._id)
    
    // Determine what data exists in MongoDB
    const hasRevenue = transaction.revenue !== undefined && transaction.revenue !== null
    const hasSale = transaction.preTaxAmount !== undefined && transaction.preTaxAmount !== null
    const hasTax = transaction.taxAmount !== undefined && transaction.taxAmount !== null
    
    // Calculate missing values
    const displayRevenue = transaction.revenue || Number(transaction.amount) || 0
    let displaySale: number
    let displayTax: number
    
    if (hasAgency) {
      displaySale = displayRevenue
      displayTax = 0
    } else {
      const computed = computeFromRevenue(displayRevenue, hasAgency)
      displaySale = transaction.preTaxAmount || computed.sale
      displayTax = transaction.taxAmount || computed.tax
    }
    
    const allFieldsExist = hasRevenue && hasSale && hasTax
    
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs">
          <span className="font-medium">Revenue:</span>
          <span className={`px-1 rounded ${hasRevenue ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
            ${displayRevenue.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="font-medium">Sale:</span>
          <span className={`px-1 rounded ${hasSale ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
            ${displaySale.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="font-medium">Tax:</span>
          <span className={`px-1 rounded ${hasTax ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
            ${displayTax.toFixed(2)}
          </span>
        </div>
        {!allFieldsExist && (
          <button
            onClick={() => saveTaxData(transaction._id, displayRevenue, displaySale, displayTax)}
            disabled={isSaving}
            className={`mt-1 px-2 py-1 text-xs rounded transition-colors ${
              isSaving 
                ? 'bg-gray-100 cursor-not-allowed text-gray-500' 
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            {isSaving ? 'Saving...' : 'Save Tax Data'}
          </button>
        )}
      </div>
    )
  }

  // RevenueCell component for training transactions
  const RevenueCell = ({ transaction }: { transaction: Transaction }) => {
    const amount = Number(transaction.amount) || 0
    const revenue = Number(transaction.revenue) || 0
    const isSyncing = syncingRevenue.has(transaction._id)
    
    // Show sync button if amount is 0 but revenue exists
    const shouldShowSync = amount === 0 && revenue > 0
    
    if (shouldShowSync) {
      return (
        <div className="flex items-center gap-2 justify-end">
          <span className="font-medium text-green-600">
            ${formatNumberWithCommas(amount)}
          </span>
          <button
            onClick={() => syncRevenueToAmount(transaction._id, revenue)}
            disabled={isSyncing}
            className={`p-1 rounded transition-colors ${
              isSyncing 
                ? 'bg-gray-100 cursor-not-allowed' 
                : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            }`}
            title={isSyncing ? 'Syncing...' : `Sync revenue $${revenue.toFixed(2)} to amount`}
          >
            {isSyncing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </button>
        </div>
      )
    }
    
    return (
      <span className="font-medium text-green-600">
        ${formatNumberWithCommas(amount)}
      </span>
    )
  }

  // Sync vendor to supplier field
  const syncVendorToSupplier = async (transactionId: string, vendorValue: string) => {
    setSyncingTransactions(prev => new Set(prev).add(transactionId))
    
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supplier: vendorValue
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to sync vendor to supplier')
      }
      
      // Update local state
      setTransactions(prev => 
        prev.map(t => 
          t._id === transactionId 
            ? { ...t, supplier: vendorValue }
            : t
        )
      )
      
    } catch (error) {
      console.error('Error syncing vendor to supplier:', error)
      alert('Failed to sync vendor to supplier')
    } finally {
      setSyncingTransactions(prev => {
        const newSet = new Set(prev)
        newSet.delete(transactionId)
        return newSet
      })
    }
  }

  // Update transaction's purchaseCategory with the expenseType value
  const updateTransactionCategory = async (transactionId: string, expenseType: string) => {
    setUpdatingTransactions(prev => new Set(prev).add(transactionId))
    
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          purchaseCategory: expenseType
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to update transaction')
      }
      
      // Update local state
      setTransactions(prev => 
        prev.map(t => 
          t._id === transactionId 
            ? { ...t, purchaseCategory: expenseType }
            : t
        )
      )
      
      // Show success feedback
      setSuccessTransactions(prev => new Set(prev).add(transactionId))
      setTimeout(() => {
        setSuccessTransactions(prev => {
          const newSet = new Set(prev)
          newSet.delete(transactionId)
          return newSet
        })
      }, 2000)
      
    } catch (error) {
      console.error('Error updating transaction:', error)
      alert('Failed to update transaction category')
    } finally {
      setUpdatingTransactions(prev => {
        const newSet = new Set(prev)
        newSet.delete(transactionId)
        return newSet
      })
    }
  }

  // SupplierCell component with sync functionality
  const SupplierCell = ({ transaction }: { transaction: Transaction }) => {
    const [isEditingSupplier, setIsEditingSupplier] = useState(false)
    const [tempSupplierValue, setTempSupplierValue] = useState('')
    const hasSupplier = transaction.supplier && transaction.supplier.trim() !== ''
    const hasVendor = transaction.vendor && transaction.vendor.trim() !== ''
    const isSyncing = syncingTransactions.has(transaction._id)
    const isUpdating = updatingTransactions.has(transaction._id)
    
    const handleEditSupplier = () => {
      setTempSupplierValue(transaction.supplier || '')
      setIsEditingSupplier(true)
    }
    
    const handleSaveSupplier = async () => {
      if (tempSupplierValue.trim()) {
        setUpdatingTransactions(prev => new Set(prev).add(transaction._id))
        
        try {
          const response = await fetch(`/api/transactions/${transaction._id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              supplier: tempSupplierValue.trim()
            }),
          })
          
          if (!response.ok) {
            throw new Error('Failed to update supplier')
          }
          
          // Update local state
          setTransactions(prev => 
            prev.map(t => 
              t._id === transaction._id 
                ? { ...t, supplier: tempSupplierValue.trim() }
                : t
            )
          )
          
        } catch (error) {
          console.error('Error updating supplier:', error)
          alert('Failed to update supplier')
        } finally {
          setUpdatingTransactions(prev => {
            const newSet = new Set(prev)
            newSet.delete(transaction._id)
            return newSet
          })
        }
      }
      setIsEditingSupplier(false)
    }
    
    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSaveSupplier()
      } else if (e.key === 'Escape') {
        setIsEditingSupplier(false)
        setTempSupplierValue('')
      }
    }
    
    if (hasSupplier) {
      return (
        <span 
          className="cursor-pointer hover:bg-gray-100 px-1 rounded"
          onClick={handleEditSupplier}
          title="Click to edit supplier"
        >
          {transaction.supplier}
          {isEditingSupplier && (
            <div className="absolute bottom-full left-0 mb-1 z-10">
              <input
                type="text"
                value={tempSupplierValue}
                onChange={(e) => setTempSupplierValue(e.target.value)}
                onBlur={handleSaveSupplier}
                onKeyDown={handleKeyPress}
                className="border border-gray-300 rounded px-2 py-1 text-sm bg-white shadow-lg min-w-[120px]"
                placeholder="Enter supplier name"
                autoFocus
              />
            </div>
          )}
        </span>
      )
    }
    
    if (hasVendor) {
      return (
        <div className="flex items-center gap-2">
          <span 
            className="cursor-pointer hover:bg-gray-100 px-1 rounded relative"
            onClick={handleEditSupplier}
            title="Click to add supplier"
          >
            N/A
            {isEditingSupplier && (
              <div className="absolute bottom-full left-0 mb-1 z-10">
                <input
                  type="text"
                  value={tempSupplierValue}
                  onChange={(e) => setTempSupplierValue(e.target.value)}
                  onBlur={handleSaveSupplier}
                  onKeyDown={handleKeyPress}
                  className="border border-gray-300 rounded px-2 py-1 text-sm bg-white shadow-lg min-w-[120px]"
                  placeholder="Enter supplier name"
                  autoFocus
                />
              </div>
            )}
          </span>
          <button
            onClick={() => syncVendorToSupplier(transaction._id, transaction.vendor!)}
            disabled={isSyncing || isUpdating}
            className={`p-1 rounded transition-colors ${
              isSyncing || isUpdating
                ? 'bg-gray-100 cursor-not-allowed' 
                : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
            }`}
            title={isSyncing ? 'Syncing...' : `Sync vendor "${transaction.vendor}" to supplier`}
          >
            {isSyncing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </button>
        </div>
      )
    }
    
    return (
      <span 
        className="cursor-pointer hover:bg-gray-100 px-1 rounded relative"
        onClick={handleEditSupplier}
        title="Click to add supplier"
      >
        N/A
        {isEditingSupplier && (
          <div className="absolute bottom-full left-0 mb-1 z-10">
            <input
              type="text"
              value={tempSupplierValue}
              onChange={(e) => setTempSupplierValue(e.target.value)}
              onBlur={handleSaveSupplier}
              onKeyDown={handleKeyPress}
              className="border border-gray-300 rounded px-2 py-1 text-sm bg-white shadow-lg min-w-[120px]"
              placeholder="Enter supplier name"
              autoFocus
            />
          </div>
        )}
      </span>
    )
  }

  // EditableExpenseType component
  const EditableExpenseType = ({ transaction }: { transaction: Transaction }) => {
    const [isEditing, setIsEditing] = useState(false)
    const [tempValue, setTempValue] = useState('')
    const currentExpenseType = editingExpenseTypes[transaction._id] ?? transaction.expenseType ?? ''
    const isUpdating = updatingTransactions.has(transaction._id)
    const isSuccess = successTransactions.has(transaction._id)
    
    const handleEdit = () => {
      setTempValue(currentExpenseType)
      setIsEditing(true)
    }
    
    const handleSave = () => {
      setEditingExpenseTypes(prev => ({
        ...prev,
        [transaction._id]: tempValue
      }))
      setIsEditing(false)
    }
    
    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSave()
      } else if (e.key === 'Escape') {
        setIsEditing(false)
        setTempValue('')
      }
    }
    
    const handleUpdateCategory = () => {
      const expenseTypeToUse = editingExpenseTypes[transaction._id] ?? transaction.expenseType ?? ''
      if (expenseTypeToUse.trim()) {
        updateTransactionCategory(transaction._id, expenseTypeToUse.trim())
      }
    }
    
    return (
      <div className="flex items-center gap-2">
        <span className={`text-sm px-2 py-1 rounded transition-colors ${
          isSuccess ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
        }`}>
          categorize by expenseType (
          <span 
            className="relative cursor-pointer hover:bg-gray-200 px-1 rounded"
            onClick={handleEdit}
            title="Click to edit expense type"
          >
            {currentExpenseType || 'empty'}
            {isEditing && (
              <div className="absolute bottom-full left-0 mb-1 z-10">
                <input
                  type="text"
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={handleKeyPress}
                  className="border border-gray-300 rounded px-2 py-1 text-sm bg-white shadow-lg min-w-[120px]"
                  placeholder="Enter expense type"
                  autoFocus
                />
              </div>
            )}
          </span>
          )
        </span>
        <button
          onClick={handleUpdateCategory}
          disabled={isUpdating || !currentExpenseType.trim()}
          className={`p-1 rounded transition-colors ${
            isUpdating 
              ? 'bg-gray-100 cursor-not-allowed' 
              : isSuccess
                ? 'bg-green-100 text-green-600'
                : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
          } ${!currentExpenseType.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={isUpdating ? 'Updating...' : isSuccess ? 'Updated!' : 'Update category'}
        >
          {isUpdating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
        </button>
      </div>
    )
      }
  
  // Add function to fetch Shopify fees for transactions missing fee data
  const fetchShopifyFees = async (transactionId: string) => {
    setFetchingFees(prev => new Set(prev).add(transactionId))
    
    try {
      const response = await fetch(`/api/transactions/${transactionId}/shopify-fees`, {
        method: 'POST'
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch Shopify fees')
      }
      
      const data = await response.json()
      
      // Update the transaction in our local state with paymentProcessing data
      setTransactions(prev => 
        prev.map(t => 
          t._id === transactionId 
            ? { ...t, paymentProcessing: { fee: data.processingFee, provider: 'Shopify' } }
            : t
        )
      )
      
      // Update CC fee transactions as well
      setCcFeeTransactions(prev => 
        prev.map(t => 
          t._id === transactionId 
            ? { ...t, paymentProcessing: { fee: data.processingFee, provider: 'Shopify' } }
            : t
        )
      )
      
      alert(`Successfully fetched Shopify fee: $${data.processingFee.toFixed(2)}`)
      
    } catch (error) {
      console.error('Error fetching Shopify fees:', error)
      alert(error instanceof Error ? error.message : 'Failed to fetch Shopify fees')
    } finally {
      setFetchingFees(prev => {
        const newSet = new Set(prev)
        newSet.delete(transactionId)
        return newSet
      })
    }
  }

  // Add function to calculate and store Square fees for transactions missing fee data
  const fetchSquareFees = async (transactionId: string) => {
    setFetchingFees(prev => new Set(prev).add(transactionId))
    
    try {
      const response = await fetch(`/api/transactions/${transactionId}/square-fees`, {
        method: 'POST'
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to calculate Square fees')
      }
      
      const data = await response.json()
      
      // Update the transaction in our local state with paymentProcessing data
      setTransactions(prev => 
        prev.map(t => 
          t._id === transactionId 
            ? { ...t, paymentProcessing: { fee: data.processingFee, provider: 'Square' } }
            : t
        )
      )
      
      // Update CC fee transactions as well
      setCcFeeTransactions(prev => 
        prev.map(t => 
          t._id === transactionId 
            ? { ...t, paymentProcessing: { fee: data.processingFee, provider: 'Square' } }
            : t
        )
      )
      
      alert(`Successfully calculated Square fee: $${data.processingFee.toFixed(2)}`)
      
    } catch (error) {
      console.error('Error fetching Square fees:', error)
      alert(error instanceof Error ? error.message : 'Failed to calculate Square fees')
    } finally {
      setFetchingFees(prev => {
        const newSet = new Set(prev)
        newSet.delete(transactionId)
        return newSet
      })
    }
  }

    // Render a transaction row (reused across categories)
  const renderTransactionRow = (transaction: Transaction) => (
    <tr key={transaction._id} className="border-b hover:bg-gray-50">
      <td className="p-3 text-sm">{formatTransactionDate(transaction.date)}</td>
      <td className="p-3 text-sm">
        <SupplierCell transaction={transaction} />
      </td>
      <td className="p-3 text-sm">{transaction.description || 'N/A'}</td>
      <td className="p-3 text-sm">{transaction.paymentMethod || 'N/A'}</td>
      <td className="p-3 text-sm">
        <EditableExpenseType transaction={transaction} />
      </td>
      <td className="p-3 text-sm text-right font-medium text-red-600">
        ${formatNumberWithCommas(transaction.amount)}
      </td>
    </tr>
  )

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Profit & Loss</h1>
      
      {/* Date range selectors */}
      <div className="mb-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-medium mb-4">Time Period</h3>
        <div className="flex flex-wrap items-center gap-4">
          {/* Quick range selectors */}
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
                className={cn(
                  isClient && activeRange === range.id ? "bg-primary-50 text-primary-700 border-primary-200" : ""
                )}
              >
                {range.label}
              </Button>
            ))}
          </div>

          {/* Custom date range picker */}
          <div className="flex gap-2 items-center ml-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  size="sm"
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    (!isClient || !startDate) && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {isClient && startDate ? format(startDate, "PPP") : <span>Pick start date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    setStartDate(date);
                    setActiveRange('custom');
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
                    (!isClient || !endDate) && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {isClient && endDate ? format(endDate, "PPP") : <span>Pick end date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => {
                    setEndDate(date);
                    setActiveRange('custom');
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
      </div>
      
      {/* Revenue Breakdown Card */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Revenue Breakdown</CardTitle>
              <CardDescription>
                Summary of all revenue streams
                {isClient && startDate && endDate && (
                  <span className="ml-1">
                    ({format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")})
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Retail Box */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="text-lg font-medium text-blue-800 mb-3">Retail</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-blue-700">Revenue:</span>
                  <span className="font-semibold text-blue-900">${formatNumberWithCommas(revenueBreakdown.retail.revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-blue-700">Sales:</span>
                  <span className="font-semibold text-blue-900">${formatNumberWithCommas(revenueBreakdown.retail.sales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-blue-700">Taxable:</span>
                  <span className="font-semibold text-blue-900">${formatNumberWithCommas(revenueBreakdown.retail.taxable)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-blue-700">Tax:</span>
                  <span className="font-semibold text-blue-900">${formatNumberWithCommas(revenueBreakdown.retail.tax)}</span>
                </div>
              </div>
            </div>

            {/* Training Box */}
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <h3 className="text-lg font-medium text-purple-800 mb-3">Training</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-purple-700">Revenue:</span>
                  <span className="font-semibold text-purple-900">${formatNumberWithCommas(revenueBreakdown.training.revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-purple-700">Sales:</span>
                  <span className="font-semibold text-purple-900">${formatNumberWithCommas(revenueBreakdown.training.sales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-purple-700">Taxable:</span>
                  <span className="font-semibold text-purple-900">${formatNumberWithCommas(revenueBreakdown.training.taxable)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-purple-700">Tax:</span>
                  <span className="font-semibold text-purple-900">${formatNumberWithCommas(revenueBreakdown.training.tax)}</span>
                </div>
              </div>
            </div>

            {/* Total Box */}
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <h3 className="text-lg font-medium text-green-800 mb-3">Total</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-green-700">Revenue:</span>
                  <span className="font-bold text-green-900 text-lg">${formatNumberWithCommas(revenueBreakdown.total.revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-green-700">Sales:</span>
                  <span className="font-semibold text-green-900">${formatNumberWithCommas(revenueBreakdown.total.sales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-green-700">Taxable:</span>
                  <span className="font-semibold text-green-900">${formatNumberWithCommas(revenueBreakdown.total.taxable)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-green-700">Tax:</span>
                  <span className="font-semibold text-green-900">${formatNumberWithCommas(revenueBreakdown.total.tax)}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profit Breakdown Card */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Profit Breakdown</CardTitle>
              <CardDescription>
                Total sales minus total expenses
                {isClient && startDate && endDate && (
                  <span className="ml-1">
                    ({format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")})
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="p-6 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Total Sales */}
              <div className="text-center">
                <h3 className="text-sm font-medium text-emerald-700 mb-2">Total Sales</h3>
                <p className="text-2xl font-bold text-emerald-900">
                  ${formatNumberWithCommas(revenueBreakdown.total.sales)}
                </p>
              </div>
              
              {/* Total Expenses */}
              <div className="text-center">
                <h3 className="text-sm font-medium text-red-700 mb-2">Total Expenses</h3>
                <p className="text-2xl font-bold text-red-900">
                  ${formatNumberWithCommas(totalAmount)}
                </p>
              </div>
              
              {/* Net Profit */}
              <div className="text-center">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Net Profit</h3>
                <p className={`text-3xl font-bold ${
                  (revenueBreakdown.total.sales - totalAmount) >= 0 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`}>
                  {(revenueBreakdown.total.sales - totalAmount) >= 0 ? '+' : ''}${formatNumberWithCommas(Math.abs(revenueBreakdown.total.sales - totalAmount))}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {((revenueBreakdown.total.sales - totalAmount) / (revenueBreakdown.total.sales || 1) * 100).toFixed(1)}% margin
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Training Transactions Section */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Training Transactions</CardTitle>
              <CardDescription>
                All training sessions and revenue
                {isClient && startDate && endDate && (
                  <span className="ml-1">
                    ({format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")})
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const trainingTransactions = transactions.filter(t => t.type === 'training')
            const trainingTotal = revenueBreakdown.training.revenue
            
            if (loading) {
              return (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 text-blue-500 animate-spin mr-2" />
                  <p>Loading training transactions...</p>
                </div>
              )
            }
            
            if (error) {
              return (
                <div className="text-red-500 py-4">
                  Error: {error}
                </div>
              )
            }
            
            if (trainingTransactions.length === 0) {
              return (
                <div className="text-center py-8 text-gray-500">
                  No training transactions found for the selected period.
                </div>
              )
            }
            
            return (
              <div>
                <div className="bg-green-100 p-4 rounded-lg mb-6">
                  <h2 className="text-lg font-medium mb-2">Total Training Revenue</h2>
                  <p className="text-3xl font-bold text-green-600">
                    ${formatNumberWithCommas(trainingTotal)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Total from {trainingTransactions.length} training sessions
                  </p>
                </div>
                
                                 <div className="overflow-x-auto">
                   <table className="w-full border-collapse border rounded-md">
                     <thead>
                       <tr className="bg-gray-50">
                         <th className="text-left p-3 text-sm font-medium text-gray-500 border-b">Date</th>
                         <th className="text-left p-3 text-sm font-medium text-gray-500 border-b">Client</th>
                         <th className="text-left p-3 text-sm font-medium text-gray-500 border-b">Dog</th>
                         <th className="text-left p-3 text-sm font-medium text-gray-500 border-b">Trainer</th>
                         <th className="text-left p-3 text-sm font-medium text-gray-500 border-b">Agency</th>
                         <th className="text-left p-3 text-sm font-medium text-gray-500 border-b">Sales Tax</th>
                         <th className="text-right p-3 text-sm font-medium text-gray-500 border-b">Revenue</th>
                       </tr>
                     </thead>
                     <tbody>
                       {trainingTransactions.map(transaction => (
                         <tr key={transaction._id} className="border-b hover:bg-gray-50">
                           <td className="p-3 text-sm">{formatTransactionDate(transaction.date)}</td>
                           <td className="p-3 text-sm">{transaction.clientName || 'N/A'}</td>
                           <td className="p-3 text-sm">{transaction.dogName || 'N/A'}</td>
                           <td className="p-3 text-sm">{transaction.trainer || 'N/A'}</td>
                           <td className="p-3 text-sm">{transaction.trainingAgency || 'N/A'}</td>
                           <td className="p-3 text-sm">
                             <TaxCell transaction={transaction} />
                           </td>
                           <td className="p-3 text-sm text-right">
                             <RevenueCell transaction={transaction} />
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
              </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* Expenses Card */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Total Expenses</CardTitle>
              <CardDescription>
                Total amount of all expenses
                {isClient && startDate && endDate && (
                  <span className="ml-1">
                    ({format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")})
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin mr-2" />
              <p>Loading expenses...{loadingProgress ? ` ${loadingProgress}` : ''}</p>
            </div>
          ) : error ? (
            <div className="text-red-500 py-4">
              Error: {error}
            </div>
          ) : (
            <div>
              <div className="bg-gray-100 p-4 rounded-lg mb-6">
                <h2 className="text-lg font-medium mb-2">Total Expenses</h2>
                <p className="text-3xl font-bold text-red-600">
                  ${formatNumberWithCommas(totalAmount)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Total from {transactions.filter(t => t.type === 'expense').length} expense transactions + credit card fees
                </p>
              </div>
              
              {/* Category Summary */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">Expense Categories</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleAllCategories}
                    className="flex items-center gap-1 text-sm"
                  >
                    {expandedCategories.has('all') ? (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        Collapse All
                      </>
                    ) : (
                      <>
                        <ChevronRight className="h-4 w-4" />
                        Expand All
                      </>
                    )}
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {categoryGroups.map(group => (
                    <div key={group.name} className="border rounded-md overflow-hidden">
                      {/* Category Header */}
                      <div 
                        className="bg-gray-50 p-3 flex justify-between items-center cursor-pointer"
                        onClick={() => toggleCategory(group.name)}
                      >
                        <div className="flex items-center gap-2">
                          {expandedCategories.has(group.name) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <h4 className="font-medium">{group.name}</h4>
                          <span className="text-sm text-gray-500">
                            ({group.transactions.length} transactions)
                          </span>
                        </div>
                        <div className="font-semibold text-red-600">
                          ${formatNumberWithCommas(group.subtotal)}
                        </div>
                      </div>
                      
                      {/* Category Transactions */}
                      {expandedCategories.has(group.name) && (
                        <div className="overflow-x-auto">
                                                     {group.name === 'Credit Card Transaction Fees' ? (
                             // Special UI for Credit Card Transaction Fees
                             <div>
                               <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                                                    <p className="text-sm text-blue-800">
                                     <strong>Credit Card Transaction Fees:</strong> Processing fees are automatically stored when Square and Shopify transactions are synced.
                                     For transactions missing fee data, click &quot;Fetch Fee&quot; to retrieve actual Shopify fees from their API or calculate Square fees (2.6% + $0.10).
                                   </p>
                               </div>
                               <table className="w-full border-collapse">
                              <thead>
                                <tr className="bg-gray-50 border-t border-b">
                                  <th className="text-left p-3 text-sm font-medium text-gray-500">Date</th>
                                  <th className="text-left p-3 text-sm font-medium text-gray-500">Source</th>
                                  <th className="text-left p-3 text-sm font-medium text-gray-500">Customer</th>
                                  <th className="text-right p-3 text-sm font-medium text-gray-500">Revenue</th>
                                                                     <th className="text-right p-3 text-sm font-medium text-gray-500">Processing Fee</th>
                                   <th className="text-center p-3 text-sm font-medium text-gray-500">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ccFeeTransactions.map(transaction => (
                                  <tr key={transaction._id} className="border-b hover:bg-gray-50">
                                    <td className="p-3 text-sm">{formatTransactionDate(transaction.date)}</td>
                                    <td className="p-3 text-sm">
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                        transaction.source === 'shopify' 
                                          ? 'bg-green-100 text-green-800' 
                                          : 'bg-blue-100 text-blue-800'
                                      }`}>
                                        {transaction.source.charAt(0).toUpperCase() + transaction.source.slice(1)}
                                      </span>
                                    </td>
                                    <td className="p-3 text-sm">{transaction.customer || transaction.clientName || 'N/A'}</td>
                                    <td className="p-3 text-sm text-right font-medium">
                                      ${formatNumberWithCommas(transaction.amount)}
                                    </td>
                                                                                                              <td className="p-3 text-sm text-right">
                                       <span className={`font-medium ${
                                         transaction.source === 'shopify' ? 'text-green-600' : 'text-blue-600'
                                       }`}>
                                         ${transaction.paymentProcessing?.fee ? 
                                           formatNumberWithCommas(transaction.paymentProcessing.fee) : 
                                           'No fee data'
                                         }
                                       </span>
                                       {transaction.paymentProcessing?.provider && (
                                         <div className="text-xs text-gray-500 mt-1">
                                           via {transaction.paymentProcessing.provider}
                                         </div>
                                       )}
                                     </td>
                                     <td className="p-3 text-sm text-center">
                                       {transaction.paymentProcessing?.fee ? (
                                         <span className="text-xs text-green-600 font-medium">
                                           ✓ Stored
                                         </span>
                                       ) : (
                                         <button
                                           onClick={() => {
                                             if (transaction.source === 'shopify') {
                                               fetchShopifyFees(transaction._id)
                                             } else if (transaction.source === 'square') {
                                               fetchSquareFees(transaction._id)
                                             }
                                           }}
                                           disabled={fetchingFees.has(transaction._id)}
                                           className={`px-3 py-1 rounded text-xs font-medium ${
                                             fetchingFees.has(transaction._id)
                                               ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                               : transaction.source === 'shopify'
                                                 ? 'bg-green-600 text-white hover:bg-green-700'
                                                 : 'bg-blue-600 text-white hover:bg-blue-700'
                                           }`}
                                         >
                                           {fetchingFees.has(transaction._id) ? 'Fetching...' : 'Fetch Fee'}
                                         </button>
                                       )}
                                     </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50 border-t">
                                  <td colSpan={4} className="p-3 text-sm font-medium text-right">
                                    Total Credit Card Fees:
                                  </td>
                                  <td className="p-3 text-sm text-right font-bold text-red-600">
                                    ${formatNumberWithCommas(group.subtotal)}
                                  </td>
                                  <td className="p-3"></td>
                                                                 </tr>
                               </tfoot>
                             </table>
                           </div>
                           ) : (
                            // Regular expense category UI
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="bg-gray-50 border-t border-b">
                                  <th className="text-left p-3 text-sm font-medium text-gray-500">Date</th>
                                  <th className="text-left p-3 text-sm font-medium text-gray-500">Vendor</th>
                                  <th className="text-left p-3 text-sm font-medium text-gray-500">Description</th>
                                  <th className="text-left p-3 text-sm font-medium text-gray-500">Payment Method</th>
                                  <th className="text-left p-3 text-sm font-medium text-gray-500">Expense Type</th>
                                  <th className="text-right p-3 text-sm font-medium text-gray-500">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.transactions.map(transaction => renderTransactionRow(transaction))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {transactions.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No expense transactions found.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 