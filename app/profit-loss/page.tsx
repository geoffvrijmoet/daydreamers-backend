'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNumberWithCommas } from "@/lib/utils"
import { Loader2, ChevronDown, ChevronRight } from "lucide-react"
import { toEasternTime, formatInEasternTime } from '@/lib/utils/dates'
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format, subDays } from "date-fns"
import { cn } from "@/lib/utils"
import { CalendarIcon } from "lucide-react"

interface PurchaseTransaction {
  _id: string
  date: string
  amount: number
  vendor?: string
  description?: string
  paymentMethod?: string
  purchaseCategory?: string
  supplierOrderNumber?: string
}

interface CategoryGroup {
  name: string
  transactions: PurchaseTransaction[]
  subtotal: number
}

export default function ProfitLossPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<PurchaseTransaction[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const [activeRange, setActiveRange] = useState<string>('allTime')
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['all']))

  useEffect(() => {
    fetchPurchaseTransactions()
  }, [startDate, endDate])

  // Process transactions into category groups
  useEffect(() => {
    if (transactions.length === 0) {
      setCategoryGroups([])
      return
    }

    // Create category groups
    const groups = new Map<string, CategoryGroup>()
    
    // Process each transaction
    transactions.forEach(transaction => {
      // Get category name (or "Uncategorized" if missing)
      const categoryName = transaction.purchaseCategory 
        ? (transaction.purchaseCategory.charAt(0).toUpperCase() + transaction.purchaseCategory.slice(1))
        : "Uncategorized"
      
      // Create or update category group
      if (!groups.has(categoryName)) {
        groups.set(categoryName, {
          name: categoryName,
          transactions: [],
          subtotal: 0
        })
      }
      
      const group = groups.get(categoryName)!
      group.transactions.push(transaction)
      group.subtotal += transaction.amount
    })
    
    // Convert Map to Array and sort by amount (descending)
    const sortedGroups = Array.from(groups.values())
      .sort((a, b) => b.subtotal - a.subtotal)
    
    setCategoryGroups(sortedGroups)
  }, [transactions])

  const fetchPurchaseTransactions = async () => {
    try {
      setLoading(true)
      
      // Construct the query URL with date parameters if present
      let url = '/api/transactions?type=purchase'
      if (startDate) {
        url += `&startDate=${startDate.toISOString()}`
      }
      if (endDate) {
        url += `&endDate=${endDate.toISOString()}`
      }
      
      // Fetch purchase transactions from MongoDB
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error('Failed to fetch purchase transactions')
      }
      
      const data = await response.json()
      
      // Extract the purchase transactions
      const purchaseTransactions = data.transactions as PurchaseTransaction[]
      
      // Calculate the total amount
      const total = purchaseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)
      
      setTransactions(purchaseTransactions)
      setTotalAmount(total)
    } catch (err) {
      console.error('Error fetching purchase transactions:', err)
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Format transaction date
  const formatTransactionDate = (date: string): string => {
    const parsedDate = toEasternTime(date)
    return formatInEasternTime(parsedDate, 'MMM d, yyyy')
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

  // Render a transaction row (reused across categories)
  const renderTransactionRow = (transaction: PurchaseTransaction) => (
    <tr key={transaction._id} className="border-b hover:bg-gray-50">
      <td className="p-3 text-sm">{formatTransactionDate(transaction.date)}</td>
      <td className="p-3 text-sm">{transaction.vendor || 'N/A'}</td>
      <td className="p-3 text-sm">{transaction.description || 'N/A'}</td>
      <td className="p-3 text-sm">{transaction.paymentMethod || 'N/A'}</td>
      <td className="p-3 text-sm text-right font-medium text-red-600">
        ${formatNumberWithCommas(transaction.amount)}
      </td>
    </tr>
  )

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Profit & Loss</h1>
      
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Purchase Transactions</CardTitle>
              <CardDescription>
                Total amount of all purchase transactions
                {startDate && endDate && (
                  <span className="ml-1">
                    ({format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")})
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Date range selectors */}
          <div className="mb-6">
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
                    className={activeRange === range.id ? "bg-primary-50 text-primary-700 border-primary-200" : ""}
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

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin mr-2" />
              <p>Loading purchase transactions...</p>
            </div>
          ) : error ? (
            <div className="text-red-500 py-4">
              Error: {error}
            </div>
          ) : (
            <div>
              <div className="bg-gray-100 p-4 rounded-lg mb-6">
                <h2 className="text-lg font-medium mb-2">Total Purchases</h2>
                <p className="text-3xl font-bold text-red-600">
                  ${formatNumberWithCommas(totalAmount)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Total from {transactions.length} purchase transactions
                </p>
              </div>
              
              {/* Category Summary */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">Purchase Categories</h3>
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
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="bg-gray-50 border-t border-b">
                                <th className="text-left p-3 text-sm font-medium text-gray-500">Date</th>
                                <th className="text-left p-3 text-sm font-medium text-gray-500">Vendor</th>
                                <th className="text-left p-3 text-sm font-medium text-gray-500">Description</th>
                                <th className="text-left p-3 text-sm font-medium text-gray-500">Payment Method</th>
                                <th className="text-right p-3 text-sm font-medium text-gray-500">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.transactions.map(transaction => renderTransactionRow(transaction))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {transactions.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No purchase transactions found.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 