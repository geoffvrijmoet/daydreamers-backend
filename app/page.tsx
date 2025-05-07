'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ShoppingCart, Receipt, GraduationCap, LineChart, Package } from "lucide-react"
import { NewSaleModal } from '@/components/new-transaction-modal'
import { TransactionsModal } from '@/components/transactions-modal'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [showWelcome, setShowWelcome] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [showProfitLoss, setShowProfitLoss] = useState(false)
  const [showNewSaleModal, setShowNewSaleModal] = useState(false)
  const [showTransactionsModal, setShowTransactionsModal] = useState(false)

  useEffect(() => {
    // Fade in welcome message first
    setShowWelcome(true)
    
    // Fade in action buttons after a delay
    const actionsTimer = setTimeout(() => {
      setShowActions(true)
    }, 200)
    
    // Fade in profit/loss button last
    const profitLossTimer = setTimeout(() => {
      setShowProfitLoss(true)
    }, 300)

    return () => {
      clearTimeout(actionsTimer)
      clearTimeout(profitLossTimer)
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-16 sm:px-6 lg:px-8">

        <div className="text-center space-y-6 sm:space-y-8">
          {/* Welcome Message */}
          <div 
            className={`transition-opacity duration-500 ${
              showWelcome ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-4">
              Welcome, Daydreamers Admin!
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300">
              What would you like to do?
            </p>
          </div>

          {/* Action Buttons */}
          <div 
            className={`transition-opacity duration-500 ${
              showActions ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mt-6 sm:mt-8">
              <Card 
                className="p-4 sm:p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setShowNewSaleModal(true)}
              >
                <Button variant="ghost" className="w-full h-full flex flex-col gap-3 sm:gap-4">
                  <ShoppingCart className="h-6 w-6 sm:h-8 sm:w-8" />
                  <span className="text-sm sm:text-base">New Sale</span>
                </Button>
              </Card>

              <Card 
                className="p-4 sm:p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setShowTransactionsModal(true)}
              >
                <Button variant="ghost" className="w-full h-full flex flex-col gap-3 sm:gap-4">
                  <Receipt className="h-6 w-6 sm:h-8 sm:w-8" />
                  <span className="text-sm sm:text-base">View Transactions</span>
                </Button>
              </Card>

              <Card 
                className="p-4 sm:p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setShowNewSaleModal(true)}
              >
                <Button variant="ghost" className="w-full h-full flex flex-col gap-3 sm:gap-4">
                  <GraduationCap className="h-6 w-6 sm:h-8 sm:w-8" />
                  <span className="text-sm sm:text-base">New Training Session</span>
                </Button>
              </Card>
            </div>
          </div>

          {/* Bottom Cards Section (Profit/Loss and Products) */}
          <div 
            className={`transition-opacity duration-1000 ${
              showProfitLoss ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-6 sm:mt-8">
              {/* Profit/Loss Card */}
              <Card 
                className="p-4 sm:p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => router.push('/profit-loss')}
              >
                <Button variant="ghost" className="w-full h-full flex flex-col gap-3 sm:gap-4">
                  <LineChart className="h-6 w-6 sm:h-8 sm:w-8" />
                  <span className="text-sm sm:text-base">Profit/Loss</span>
                </Button>
              </Card>

              {/* Products Card */}
              <Card 
                className="p-4 sm:p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => router.push('/products')}
              >
                <Button variant="ghost" className="w-full h-full flex flex-col gap-3 sm:gap-4">
                  <Package className="h-6 w-6 sm:h-8 sm:w-8" />
                  <span className="text-sm sm:text-base">Products</span>
                </Button>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* New Sale Modal */}
      <NewSaleModal 
        open={showNewSaleModal}
        onOpenChange={setShowNewSaleModal}
        onSuccess={() => {
          // Optionally refresh data or show success message
        }}
      />

      {/* Transactions Modal */}
      <TransactionsModal
        open={showTransactionsModal}
        onOpenChange={setShowTransactionsModal}
      />
    </div>
  )
}
