'use client'

import { useState, useEffect } from 'react'
import { type EmailTransaction } from '@/types'

export function AmexTransactions() {
  const [transactions, setTransactions] = useState<EmailTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const response = await fetch('/api/gmail/amex/fetch');
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch transactions');
        }
        
        setTransactions(data.transactions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
      }
    };

    fetchTransactions();
  }, []);

  if (error) {
    return <div className="text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search transactions..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full p-2 border rounded"
      />
      
      {transactions.length === 0 ? (
        <div>No transactions found</div>
      ) : (
        <div className="space-y-2">
          {transactions
            .filter(t => 
              t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
              t.merchant.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map(transaction => (
              <div 
                key={transaction.id}
                className="p-4 border rounded hover:bg-gray-50"
              >
                <div className="font-medium">{transaction.merchant}</div>
                <div className="text-sm text-gray-600">{transaction.description}</div>
                <div className="text-sm">Amount: ${transaction.amount.toFixed(2)}</div>
                <div className="text-xs text-gray-500">Card ending in {transaction.cardLast4}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
} 