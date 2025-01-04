import { useState, useEffect, useCallback } from 'react'
import { Transaction } from '@/types'
import { startOfDay, endOfDay } from 'date-fns'
import { logger } from '@/lib/utils/logger'
import { fromEasternTime } from '@/lib/utils/dates'

interface UseTransactionsOptions {
  startDate?: string;
  endDate?: string;
}

interface UseTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  refreshTransactions: () => Promise<void>;
}

export function useTransactions(options?: UseTransactionsOptions): UseTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const queryParams = new URLSearchParams();
      
      if (options?.startDate) {
        const start = startOfDay(new Date(options.startDate));
        queryParams.set('startDate', fromEasternTime(start));
      }
      
      if (options?.endDate) {
        const end = endOfDay(new Date(options.endDate));
        queryParams.set('endDate', fromEasternTime(end));
      }
      
      const response = await fetch(`/api/transactions/combined?${queryParams.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch transactions');
      }

      const data = await response.json();
      setTransactions(data.transactions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch transactions';
      logger.error('Error fetching transactions', { error: err });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [options?.startDate, options?.endDate]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions,
    loading,
    error,
    refreshTransactions: fetchTransactions
  };
} 