'use client'

import { useState, useEffect } from 'react'
import { Card } from "@/components/ui/card"
import { Product } from '@/types'

type TransactionProduct = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

type ManualTransaction = {
  id?: string
  date: string
  amount: number
  products: TransactionProduct[]
  type: 'sale' | 'purchase'
  paymentMethod: string
  customer?: string
}

type ManualTransactionFormProps = {
  initialData?: ManualTransaction
  onSuccess?: () => void
  onCancel?: () => void
}

export function ManualTransactionForm({ initialData, onSuccess, onCancel }: ManualTransactionFormProps) {
  const [isOpen, setIsOpen] = useState(!!initialData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [quantity, setQuantity] = useState<number>(1)
  
  const [transaction, setTransaction] = useState<ManualTransaction>(
    initialData || {
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      products: [],
      type: 'sale',
      paymentMethod: 'Venmo',
      customer: ''
    }
  )

  // Fetch available products
  useEffect(() => {
    async function fetchProducts() {
      try {
        const response = await fetch('/api/products')
        if (!response.ok) throw new Error('Failed to fetch products')
        const data = await response.json()
        setProducts(data.products)
      } catch (err) {
        console.error('Error fetching products:', err)
        setError('Failed to load products')
      }
    }
    fetchProducts()
  }, [])

  const handleAddProduct = () => {
    if (!selectedProductId) return

    const product = products.find(p => p.id === selectedProductId)
    if (!product) return

    const newProduct: TransactionProduct = {
      productId: product.id,
      name: product.name,
      quantity: quantity,
      unitPrice: product.retailPrice,
      totalPrice: product.retailPrice * quantity
    }

    setTransaction(prev => ({
      ...prev,
      products: [...prev.products, newProduct],
      amount: prev.amount + newProduct.totalPrice
    }))

    // Reset selection
    setSelectedProductId('')
    setQuantity(1)
  }

  const handleRemoveProduct = (index: number) => {
    setTransaction(prev => {
      const newProducts = [...prev.products]
      const removedProduct = newProducts[index]
      newProducts.splice(index, 1)
      return {
        ...prev,
        products: newProducts,
        amount: prev.amount - removedProduct.totalPrice
      }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (transaction.products.length === 0) {
      setError('Please add at least one product')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/transactions/manual', {
        method: initialData ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initialData ? { id: initialData.id, ...transaction } : transaction)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to save transaction')
      }

      // Reset form if not editing
      if (!initialData) {
        setTransaction({
          date: new Date().toISOString().split('T')[0],
          amount: 0,
          products: [],
          type: 'sale',
          paymentMethod: 'Venmo',
          customer: ''
        })
      }

      setIsOpen(false)
      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!initialData?.id) return
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/transactions/manual', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: initialData.id })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to delete transaction')
      }

      setIsOpen(false)
      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete transaction')
    } finally {
      setLoading(false)
      setConfirmDelete(false)
    }
  }

  if (!isOpen && !initialData) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
      >
        Add Manual Transaction
      </button>
    )
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          {initialData ? 'Edit Transaction' : 'Add Manual Transaction'}
        </h2>
        <button
          onClick={() => {
            setIsOpen(false)
            if (onCancel) onCancel()
          }}
          className="text-gray-400 hover:text-gray-500"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Date
          </label>
          <input
            type="date"
            required
            value={transaction.date}
            onChange={e => setTransaction(prev => ({ ...prev, date: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Customer Name
          </label>
          <input
            type="text"
            value={transaction.customer || ''}
            onChange={e => setTransaction(prev => ({ ...prev, customer: e.target.value }))}
            placeholder="Optional"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        {/* Products Section */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Products
          </label>
          
          {/* Product List */}
          <div className="space-y-2">
            {transaction.products.map((product, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded">
                <div>
                  <p className="text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-gray-500">
                    {product.quantity} × ${product.unitPrice.toFixed(2)} = ${product.totalPrice.toFixed(2)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveProduct(index)}
                  className="text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {/* Add Product */}
          <div className="flex gap-2">
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
            >
              <option value="">Select a product...</option>
              {products.map(product => (
                <option key={product.id} value={product.id}>
                  {product.name} - ${product.retailPrice.toFixed(2)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
            />
            <button
              type="button"
              onClick={handleAddProduct}
              disabled={!selectedProductId}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Total Amount
          </label>
          <div className="mt-1 text-lg font-medium">
            ${transaction.amount.toFixed(2)}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Payment Method
          </label>
          <select
            value={transaction.paymentMethod}
            onChange={e => setTransaction(prev => ({ ...prev, paymentMethod: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="Venmo">Venmo</option>
            <option value="Cash">Cash</option>
            <option value="Check">Check</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end space-x-4">
          {initialData && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-700"
            >
              Delete
            </button>
          )}
          <button
            type="submit"
            disabled={loading || transaction.products.length === 0}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : initialData ? 'Update' : 'Add Transaction'}
          </button>
        </div>
      </form>
    </Card>
  )
} 