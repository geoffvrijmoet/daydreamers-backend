'use client'

import { useState, useEffect } from 'react'
import { type EmailTransaction } from '@/types'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export function AmexTransactions() {
  const [transactions, setTransactions] = useState<EmailTransaction[]>([]);
  const [savedTransactions, setSavedTransactions] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const router = useRouter();

  const fetchSavedTransactions = async () => {
    try {
      // Fetch all saved transactions from MongoDB
      const savedResponse = await fetch('/api/gmail/amex');
      const savedData = await savedResponse.json();
      
      if (!savedResponse.ok) {
        throw new Error(savedData.error || 'Failed to fetch saved transactions');
      }
      
      const savedTransactions = savedData.transactions as EmailTransaction[];
      
      // Create a Set of saved transaction IDs
      const savedIds = new Set(savedTransactions.map(t => t.emailId));
      setSavedTransactions(savedIds);

      // Sort transactions by date
      const sortedTransactions = [...savedTransactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTransactions(sortedTransactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // First get new transactions from Gmail
      const newResponse = await fetch('/api/gmail/amex/fetch');
      const newData = await newResponse.json();
      
      if (!newResponse.ok) {
        throw new Error(newData.error || 'Failed to fetch new transactions');
      }
      
      const newTransactions = newData.transactions as EmailTransaction[];
      
      // Create a map of existing transactions by emailId
      const transactionMap = new Map(
        transactions.map((t) => [t.emailId, t])
      );

      // Add new transactions
      newTransactions.forEach((t) => {
        if (!transactionMap.has(t.emailId)) {
          transactionMap.set(t.emailId, t);
        }
      });

      // Convert map back to array and sort by date
      const allTransactions = Array.from(transactionMap.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTransactions(allTransactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync transactions');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchSavedTransactions();
  }, []);

  const handleTransactionClick = (transaction: EmailTransaction) => {
    router.push(`/transactions/amex/${transaction.id}`);
  };

  if (error) {
    return <div className="text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <input
          type="text"
          placeholder="Search transactions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 p-2 border rounded mr-4"
        />
        <Button 
          onClick={handleSync} 
          disabled={isSyncing}
          className="whitespace-nowrap"
        >
          {isSyncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Syncing...
            </>
          ) : (
            'Sync AMEX'
          )}
        </Button>
      </div>
      
      {transactions.length === 0 ? (
        <div>No transactions found</div>
      ) : (
        <div className="space-y-2">
          {transactions
            .filter(t => 
              t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
              (t.supplier || '').toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map(transaction => (
              <div 
                key={transaction.id}
                onClick={() => handleTransactionClick(transaction)}
                className="p-4 border rounded hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{transaction.supplier || 'No supplier'}</div>
                    <div className="text-sm text-gray-600">{transaction.description}</div>
                    <div className="text-sm">Amount: ${transaction.amount.toFixed(2)}</div>
                    <div className="text-xs text-gray-500">Card ending in {transaction.cardLast4}</div>
                  </div>
                  <div className={`text-xs px-2 py-1 rounded-full ${
                    savedTransactions.has(transaction.emailId)
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {savedTransactions.has(transaction.emailId) ? 'Processed' : 'Pending'}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
} 