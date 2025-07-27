import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

interface MetricsResponse {
  mtd: {
    totalRevenue: number;
    totalSales: number;
    totalTaxCollected: number;
    totalProfit: number;
    profitMargin: number;
    totalExpenses: number;
  };
  ytd: {
    totalRevenue: number;
    totalSales: number;
    totalTaxCollected: number;
    totalProfit: number;
    profitMargin: number;
    totalExpenses: number;
  };
  lifetime: {
    totalRevenue: number;
    totalSales: number;
    totalTaxCollected: number;
    totalProfit: number;
    profitMargin: number;
    totalExpenses: number;
  };
  trends: {
    revenueTrend: number;
    salesTrend: number;
    expensesTrend: number;
  };
}

interface Transaction {
  type: 'sale' | 'purchase';
  status: string;
  preTaxAmount?: number;
  amount: number;
  taxAmount?: number;
}

function calculatePeriodMetrics(transactions: Transaction[]) {
  // Filter out void transactions
  const activeTransactions = transactions.filter(t => t.status !== 'void')
  
  const sales = activeTransactions.filter(t => t.type === 'sale')
  const totalSales = sales.reduce((sum, t) => sum + (t.preTaxAmount || t.amount), 0)
  const totalTaxCollected = sales.reduce((sum, t) => sum + (t.taxAmount || 0), 0)
  const totalRevenue = totalSales + totalTaxCollected
  const expenses = activeTransactions
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

export async function GET(): Promise<NextResponse<MetricsResponse | { error: string }>> {
  try {
    await connectToDatabase()
    
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
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
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
    const mtd = calculatePeriodMetrics(mtdTransactions as unknown as Transaction[])
    const ytd = calculatePeriodMetrics(ytdTransactions as unknown as Transaction[])
    const lifetime = calculatePeriodMetrics(allTransactions as unknown as Transaction[])
    const lastMonth = calculatePeriodMetrics(lastMonthTransactions as unknown as Transaction[])

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