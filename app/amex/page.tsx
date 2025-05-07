'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, CreditCard, Calendar, Search } from "lucide-react"

interface AmexTransaction {
  emailId: string
  date: string
  subject: string
  from: string
  amount: number
  merchant: string
  cardLast4: string
}

export default function AmexPage() {
  const [transactions, setTransactions] = useState<AmexTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch Amex transactions when the component mounts
  useEffect(() => {
    fetchAmexTransactions()
  }, [])

  // Function to fetch Amex transactions
  const fetchAmexTransactions = async (days: number = 30) => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/amex?sinceDays=${days}`)
      
      if (!response.ok) {
        throw new Error(`Error fetching Amex transactions: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      if (data.error) {
        throw new Error(data.error)
      }
      
      setTransactions(data.transactions || [])
    } catch (error) {
      console.error('Error fetching Amex transactions:', error)
      setError(error instanceof Error ? error.message : 'An unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Amex Management</h1>
      
      
      
      {/* Controls */}
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <Button 
          onClick={() => fetchAmexTransactions(30)} 
          variant="outline"
          className="gap-2"
          disabled={loading}
        >
          <Calendar className="h-4 w-4" />
          Last 30 Days
        </Button>
        
        <Button 
          onClick={() => fetchAmexTransactions(90)} 
          variant="outline"
          className="gap-2"
          disabled={loading}
        >
          <Calendar className="h-4 w-4" />
          Last 90 Days
        </Button>
        
        <Button 
          onClick={() => fetchAmexTransactions(180)} 
          variant="outline"
          className="gap-2"
          disabled={loading}
        >
          <Calendar className="h-4 w-4" />
          Last 180 Days
        </Button>
        
        <Button 
          onClick={() => fetchAmexTransactions()} 
          variant="default"
          className="gap-2"
          disabled={loading}
        >
          <Search className="h-4 w-4" />
          Refresh
        </Button>
      </div>
      
      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center p-12">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin mr-2" />
          <p>Loading Amex transactions...</p>
        </div>
      )}
      
      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          <p className="font-medium">Error loading transactions</p>
          <p className="text-sm">{error}</p>
        </div>
      )}
      
      {/* No Results State */}
      {!loading && !error && transactions.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 text-gray-700 px-6 py-12 rounded-lg text-center">
          <CreditCard className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium mb-2">No Transactions Found</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            We couldn’t find any large purchase approval emails from American Express in the selected time period.
          </p>
        </div>
      )}
      
      {/* Transaction Cards Grid */}
      {!loading && transactions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {transactions.map((transaction) => (
            <Card key={transaction.emailId} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col">
                  {/* Card Header - Merchant & Amount */}
                  <div className="p-4 bg-blue-50 border-b border-blue-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold truncate">{transaction.merchant}</h3>
                        <p className="text-sm text-gray-500">Card ending in {transaction.cardLast4}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">${transaction.amount.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Card Footer - Date & Details */}
                  <div className="p-4">
                    <p className="text-sm text-gray-500 mb-2">
                      {formatDate(transaction.date)}
                    </p>
                    <div className="flex justify-end mt-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          // In the future, you could implement a transaction details view here
                          alert(`Transaction details for: ${transaction.merchant} - $${transaction.amount}`)
                        }}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
} 