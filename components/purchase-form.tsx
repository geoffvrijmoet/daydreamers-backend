'use client'

import { useState, useEffect } from 'react'
import { Product } from '@/types'

type PurchaseProduct = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

type Purchase = {
  id?: string
  date: string
  amount: number
  products: PurchaseProduct[]
  type: 'purchase'
  paymentMethod: string
  vendor?: string
  supplierOrderNumber?: string
  purchaseCategory?: string
}

type PurchaseFormProps = {
  onSuccess?: () => void
  onCancel?: () => void
  isExpanded?: boolean
}

export function PurchaseForm({ onSuccess, onCancel, isExpanded = false }: PurchaseFormProps) {
  const [isOpen, setIsOpen] = useState(isExpanded)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [quantity, setQuantity] = useState<number>(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  const [purchase, setPurchase] = useState<Purchase>({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    products: [],
    type: 'purchase',
    paymentMethod: 'AMEX 01001',
    vendor: '',
    supplierOrderNumber: '',
    purchaseCategory: 'inventory'
  })

  // Effect to sync isOpen with isExpanded prop
  useEffect(() => {
    setIsOpen(isExpanded);
  }, [isExpanded]);

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
    (product.sku?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  )

  const handleProductSelect = (product: Product) => {
    const newProduct: PurchaseProduct = {
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPrice: product.lastPurchasePrice || 0,
      totalPrice: product.lastPurchasePrice || 0
    }

    setPurchase(prev => ({
      ...prev,
      products: [...prev.products, newProduct],
      amount: prev.amount + newProduct.totalPrice
    }))

    setSearchQuery('')
    setShowSuggestions(false)
  }

  const handleUnitPriceChange = (index: number, newPrice: number) => {
    setPurchase(prev => {
      const newProducts = [...prev.products]
      const product = newProducts[index]
      const oldTotal = product.totalPrice
      
      // Update the product
      newProducts[index] = {
        ...product,
        unitPrice: newPrice,
        totalPrice: newPrice * product.quantity
      }
      
      // Calculate new total amount
      return {
        ...prev,
        products: newProducts,
        amount: prev.amount - oldTotal + newProducts[index].totalPrice
      }
    })
  }

  const handleQuantityChange = (index: number, newQuantity: number) => {
    if (newQuantity < 1) return // Don't allow quantities less than 1
    
    setPurchase(prev => {
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
      return {
        ...prev,
        products: newProducts,
        amount: prev.amount - oldTotal + newProducts[index].totalPrice
      }
    })
  }

  const handleRemoveProduct = (index: number) => {
    setPurchase(prev => {
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
    setLoading(true)
    setError(null)

    try {
      // Prepare purchase data with lowercase category
      const purchaseData = {
        ...purchase,
        purchaseCategory: purchase.purchaseCategory?.toLowerCase()
      };

      const response = await fetch('/api/transactions/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(purchaseData)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to save purchase')
      }

      setPurchase({
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        products: [],
        type: 'purchase',
        paymentMethod: 'AMEX 01001',
        vendor: '',
        supplierOrderNumber: '',
        purchaseCategory: 'inventory'
      })

      setIsOpen(false)
      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save purchase')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-400 hover:bg-red-500"
      >
        Add Purchase
      </button>
    )
  }

  return (
    <div>
      {!isExpanded && (
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Add Purchase</h3>
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
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Date
          </label>
          <input
            type="date"
            required
            value={purchase.date}
            onChange={e => setPurchase(prev => ({ ...prev, date: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Vendor
          </label>
          <input
            type="text"
            value={purchase.vendor || ''}
            onChange={e => setPurchase(prev => ({ ...prev, vendor: e.target.value }))}
            placeholder="Vendor name"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Supplier Order Number
          </label>
          <input
            type="text"
            value={purchase.supplierOrderNumber || ''}
            onChange={e => setPurchase(prev => ({ ...prev, supplierOrderNumber: e.target.value }))}
            placeholder="Optional - Order/Invoice number"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Products
          </label>
          
          <div className="space-y-2">
            {purchase.products.map((product, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded">
                <div className="flex-1">
                  <p className="text-sm font-medium">{product.name}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Qty:</label>
                      <input
                        type="number"
                        min="1"
                        value={product.quantity}
                        onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                        className="w-16 h-7 text-sm rounded border-gray-300 dark:bg-gray-700 dark:border-gray-600"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Price/unit:</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={product.unitPrice}
                        onChange={(e) => handleUnitPriceChange(index, parseFloat(e.target.value) || 0)}
                        className="w-20 h-7 text-sm rounded border-gray-300 dark:bg-gray-700 dark:border-gray-600"
                      />
                    </div>
                    <span className="text-sm text-gray-500">
                      = ${product.totalPrice.toFixed(2)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveProduct(index)}
                  className="text-red-600 hover:text-red-800 ml-4"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

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
                            SKU: {product.sku} - ${(product.lastPurchasePrice || 0).toFixed(2)}
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
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Payment Method
          </label>
          <select
            value={purchase.paymentMethod}
            onChange={e => setPurchase(prev => ({ ...prev, paymentMethod: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="AMEX 01001">AMEX 01001</option>
            <option value="US Bank CC 0402">US Bank CC 0402</option>
            <option value="US Bank Debit 9912">US Bank Debit 9912</option>
            <option value="Cash">Cash</option>
            <option value="Check">Check</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Purchase Category
          </label>
          <select
            value={purchase.purchaseCategory || 'inventory'}
            onChange={e => setPurchase(prev => ({ ...prev, purchaseCategory: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="inventory">Inventory</option>
            <option value="supplies">Supplies</option>
            <option value="equipment">Equipment</option>
            <option value="software">Software</option>
            <option value="advertising">Advertising</option>
            <option value="shipping">Shipping</option>
            <option value="rent">Rent</option>
            <option value="utilities">Utilities</option>
            <option value="transit">Transit</option>
            <option value="interest">Interest</option>
            <option value="other">Other</option>
          </select>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center text-lg font-medium">
            <span className="text-gray-700 dark:text-gray-300">Total:</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={purchase.amount}
                onChange={e => setPurchase(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                className="w-24 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 text-right"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Add Purchase'}
          </button>
        </div>
      </form>
    </div>
  )
} 