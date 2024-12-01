import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = await getDb()
    
    // Get date ranges
    const now = new Date()
    
    // Month to date
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    
    // Year to date
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    
    // Previous month (for trends)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    // Fetch transactions for different periods
    const mtdTransactions = await db.collection('transactions')
      .find({
        date: {
          $gte: startOfMonth.toISOString(),
          $lte: now.toISOString()
        }
      })
      .toArray()

    const ytdTransactions = await db.collection('transactions')
      .find({
        date: {
          $gte: startOfYear.toISOString(),
          $lte: now.toISOString()
        }
      })
      .toArray()

    const allTransactions = await db.collection('transactions')
      .find({})
      .toArray()

    const lastMonthTransactions = await db.collection('transactions')
      .find({
        date: {
          $gte: startOfLastMonth.toISOString(),
          $lte: endOfLastMonth.toISOString()
        }
      })
      .toArray()

    // Calculate metrics for each period
    function calculatePeriodMetrics(transactions: any[]) {
      const sales = transactions.filter(t => t.type === 'sale')
      const totalSales = sales.reduce((sum, t) => sum + (t.preTaxAmount || t.amount), 0)
      const totalTaxCollected = sales.reduce((sum, t) => sum + (t.taxAmount || 0), 0)
      const totalRevenue = totalSales + totalTaxCollected
      const expenses = transactions
        .filter(t => t.type === 'purchase')
        .reduce((sum, t) => sum + t.amount, 0)
      const totalProfit = totalSales - expenses
      const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0

      return {
        totalRevenue,
        totalSales,
        totalTaxCollected,
        totalProfit,
        profitMargin,
        totalExpenses: expenses
      }
    }

    const mtd = calculatePeriodMetrics(mtdTransactions)
    const ytd = calculatePeriodMetrics(ytdTransactions)
    const lifetime = calculatePeriodMetrics(allTransactions)
    const lastMonth = calculatePeriodMetrics(lastMonthTransactions)

    // Calculate trends
    const revenueTrend = lastMonth.totalRevenue > 0 
      ? ((mtd.totalRevenue - lastMonth.totalRevenue) / lastMonth.totalRevenue) * 100 
      : 0
    const salesTrend = lastMonth.totalSales > 0
      ? ((mtd.totalSales - lastMonth.totalSales) / lastMonth.totalSales) * 100
      : 0
    const expensesTrend = lastMonth.totalExpenses > 0
      ? ((mtd.totalExpenses - lastMonth.totalExpenses) / lastMonth.totalExpenses) * 100
      : 0

    return NextResponse.json({
      mtd,
      ytd,
      lifetime,
      trends: {
        revenueTrend,
        salesTrend,
        expensesTrend
      }
    })
  } catch (error) {
    console.error('Error fetching metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
} 