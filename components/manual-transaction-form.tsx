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
  tip?: number
  discount?: number
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
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  
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

  // Filter products based on search query
  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleProductSelect = (product: Product) => {
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
    setSearchQuery('')
    setQuantity(1)
    setShowSuggestions(false)
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

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuantity = Number(e.target.value)
    if (newQuantity < 1) return // Don't allow quantities less than 1
    setQuantity(newQuantity)
  }

  const handleExistingProductQuantityChange = (index: number, newQuantity: number) => {
    if (newQuantity < 1) return // Don't allow quantities less than 1
    
    setTransaction(prev => {
      const newProducts = [...prev.products]
      const product = newProducts[index]
      const oldTotal = product.totalPrice
      
      // Update the product
      newProducts[index] = {
        ...product,
        quantity: newQuantity,
        totalPrice: product.unitPrice * newQuantity
      }

      // Calculate new total amount
      const newTotal = product.unitPrice * newQuantity
      
      return {
        ...prev,
        products: newProducts,
        amount: prev.amount - oldTotal + newTotal
      }
    })
  }

  // Add function to calculate products total
  const calculateProductsTotal = (products: TransactionProduct[]) => {
    return products.reduce((sum, product) => sum + product.totalPrice, 0);
  };

  // Add function to handle manual amount changes
  const handleAmountChange = (newAmount: number) => {
    const productsTotal = calculateProductsTotal(transaction.products);
    const difference = newAmount - productsTotal;
    
    setTransaction(prev => ({
      ...prev,
      amount: newAmount,
      tip: difference > 0 ? difference : undefined,
      discount: difference < 0 ? Math.abs(difference) : undefined
    }));
  };

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
          
          {/* Product List with editable quantities */}
          <div className="space-y-2">
            {transaction.products.map((product, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded">
                <div className="flex-1">
                  <p className="text-sm font-medium">{product.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      min="1"
                      value={product.quantity}
                      onChange={(e) => handleExistingProductQuantityChange(index, parseInt(e.target.value) || 1)}
                      className="w-16 h-6 text-xs rounded border-gray-300 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <span className="text-xs text-gray-500">
                      × ${product.unitPrice.toFixed(2)} = ${product.totalPrice.toFixed(2)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveProduct(index)}
                  className="text-red-600 hover:text-red-800 ml-2"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {/* Add Product - Autocomplete */}
          <div className="relative">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value)
                    setShowSuggestions(true)
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Search for a product..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                />
                {/* Product Suggestions Dropdown */}
                {showSuggestions && searchQuery && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-auto">
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map(product => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => handleProductSelect(product)}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <div className="text-sm font-medium">{product.name}</div>
                          <div className="text-xs text-gray-500">
                            SKU: {product.sku} - ${product.retailPrice.toFixed(2)}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-sm text-gray-500">
                        No products found
                      </div>
                    )}
                  </div>
                )}
              </div>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={handleQuantityChange}
                className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
          </div>

          {/* Products Total and Manual Amount Section */}
          <div className="mt-4 space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Products Total:
              </span>
              <span className="text-gray-900 dark:text-white">
                ${calculateProductsTotal(transaction.products).toFixed(2)}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Final Amount
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">$</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={transaction.amount}
                  onChange={(e) => handleAmountChange(parseFloat(e.target.value) || 0)}
                  className="pl-7 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            </div>

            {/* Show Tip or Discount */}
            {transaction.tip !== undefined && transaction.tip > 0 && (
              <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                <span>Tip:</span>
                <span>+${transaction.tip.toFixed(2)}</span>
              </div>
            )}
            {transaction.discount !== undefined && transaction.discount > 0 && (
              <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                <span>Discount:</span>
                <span>-${transaction.discount.toFixed(2)}</span>
              </div>
            )}
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