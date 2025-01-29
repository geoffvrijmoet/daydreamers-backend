import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
}

export function useTransactions({ startDate, endDate }: UseTransactionsOptions = {}): UseTransactionsResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      if (startDate) queryParams.append('startDate', startDate);
      if (endDate) queryParams.append('endDate', endDate);

      const response = await fetch(`/api/transactions?${queryParams}`);
      if (!response.ok) throw new Error('Failed to fetch transactions');
      
      const data = await response.json();
      setTransactions(data.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [startDate, endDate]);

  return {
    transactions,
    loading,
    error,
    refreshTransactions: fetchTransactions,
    setTransactions
  };
} 