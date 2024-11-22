'use client'

import { useState } from 'react'
import { Card } from "@/components/ui/card"
import { Product } from '@/types'

type PurchaseInvoiceFormProps = {
  products: Product[]
  onSuccess: () => void
}

type InvoiceItem = {
  productId: string
  quantity: number
  unitPrice: number
  notes?: string
}

export function PurchaseInvoiceForm({ products, onSuccess }: PurchaseInvoiceFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invoiceId, setInvoiceId] = useState('')
  const [source, setSource] = useState<'square' | 'shopify' | 'gmail'>('square')
  const [items, setItems] = useState<InvoiceItem[]>([{ 
    productId: '', 
    quantity: 1, 
    unitPrice: 0 
  }])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Submit each item as a cost history entry
      await Promise.all(items.map(item => 
        fetch('/api/products/cost-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: item.productId,
            entry: {
              date: new Date().toISOString(),
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
              source,
              invoiceId,
              notes: item.notes
            }
          })
        })
      ))

      onSuccess()
      // Reset form
      setItems([{ productId: '', quantity: 1, unitPrice: 0 }])
      setInvoiceId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice')
    } finally {
      setLoading(false)
    }
  }

  function addItem() {
    setItems([...items, { productId: '', quantity: 1, unitPrice: 0 }])
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof InvoiceItem, value: any) {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const total = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)

  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
        Add Purchase Invoice
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Invoice ID
            </label>
            <input
              type="text"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Source
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as 'square' | 'shopify' | 'gmail')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
            >
              <option value="square">Square</option>
              <option value="shopify">Shopify</option>
              <option value="gmail">Gmail</option>
            </select>
          </div>
        </div>

        {/* Invoice Items */}
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-4 items-end border-b pb-4">
              <div className="col-span-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Product
                </label>
                <select
                  value={item.productId}
                  onChange={(e) => updateItem(index, 'productId', e.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                >
                  <option value="">Select Product</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Unit Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, 'unitPrice', Number(e.target.value))}
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notes
                </label>
                <input
                  type="text"
                  value={item.notes || ''}
                  onChange={(e) => updateItem(index, 'notes', e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              <div className="col-span-1">
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={addItem}
            className="text-blue-600 hover:text-blue-800"
          >
            + Add Item
          </button>
          <p className="text-lg font-medium">
            Total: ${total.toFixed(2)}
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Invoice'}
        </button>
      </form>
    </Card>
  )
} 