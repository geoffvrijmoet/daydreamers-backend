'use client'

import { useState } from 'react'
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Product } from '@/types'

type ManualTransactionFormProps = {
  onSuccess?: () => void
  onCancel?: () => void
}

export function ManualTransactionForm({ onSuccess, onCancel }: ManualTransactionFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    paymentMethod: 'Venmo',
    customer: '',
    products: []
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/transactions/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          type: 'sale',
          source: 'manual'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create transaction')
      }

      setIsOpen(false)
      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create transaction')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="button"
      >
        Add Venmo/Cash Sale
      </button>
    )
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-lg mb-4">New Venmo/Cash Sale</h2>

        <div>
          <label className="block text-sm mb-1">Date</label>
          <Input
            type="date"
            value={formData.date}
            onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Amount</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={formData.amount}
            onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Payment Method</label>
          <select
            value={formData.paymentMethod}
            onChange={e => setFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
            className="w-full px-3 py-2 rounded border border-gray-200"
          >
            <option value="Venmo">Venmo</option>
            <option value="Cash">Cash</option>
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Customer Name (Optional)</label>
          <Input
            type="text"
            value={formData.customer}
            onChange={e => setFormData(prev => ({ ...prev, customer: e.target.value }))}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="button"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="button button-primary"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Card>
  )
} 