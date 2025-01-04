'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Product } from '@/types'

type SelectedProduct = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export function ManualTransactionForm() {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([])
  const [customer, setCustomer] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [manualTotal, setManualTotal] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [shippingAmount, setShippingAmount] = useState<number>(0)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  // Fetch available products
  useEffect(() => {
    async function fetchProducts() {
      try {
        const response = await fetch('/api/products')
        if (!response.ok) throw new Error('Failed to fetch products')
        const data = await response.json()
        setProducts(data.products)
      } catch (error) {
        console.error('Error fetching products:', error)
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
    setSelectedProducts(prev => [...prev, {
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPrice: product.retailPrice,
      totalPrice: product.retailPrice
    }])
    setManualTotal(null)
    setSearchQuery('')
    setShowSuggestions(false)
  }

  const handleQuantityChange = (index: number, quantity: number) => {
    setSelectedProducts(prev => prev.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          quantity,
          totalPrice: item.unitPrice * quantity
        }
      }
      return item
    }))
    setManualTotal(null) // Reset manual total when products change
  }

  const handleRemoveProduct = (index: number) => {
    setSelectedProducts(prev => prev.filter((_, i) => i !== index))
    setManualTotal(null) // Reset manual total when products change
  }

  const calculateTotals = () => {
    const productsSubtotal = selectedProducts.reduce((sum, item) => sum + item.totalPrice, 0)
    const subtotal = productsSubtotal + shippingAmount // Shipping is taxable
    const finalTotal = manualTotal ?? subtotal
    const adjustment = finalTotal - subtotal // This will be positive for tips, negative for discounts

    return { 
      productsSubtotal,
      shipping: shippingAmount,
      subtotal, // This is the taxable amount (products + shipping)
      finalTotal,
      tip: adjustment > 0 ? adjustment : 0,
      discount: adjustment < 0 ? -adjustment : 0
    }
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)
      const { subtotal, finalTotal, tip, discount } = calculateTotals()

      const response = await fetch('/api/transactions/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sale',
          date,
          amount: finalTotal,
          productsTotal: subtotal - shippingAmount,
          shipping: shippingAmount,
          products: selectedProducts,
          tip: tip || undefined,
          discount: discount || undefined,
          customer,
          paymentMethod,
          source: 'manual'
        })
      })

      if (!response.ok) throw new Error('Failed to create transaction')

      // Reset form
      setSelectedProducts([])
      setManualTotal(null)
      setCustomer('')
      setPaymentMethod('')
      setShippingAmount(0) // Reset shipping

    } catch (error) {
      console.error('Error creating transaction:', error)
    } finally {
      setLoading(false)
    }
  }

  const { productsSubtotal, subtotal, finalTotal, tip, discount } = calculateTotals()

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
      >
        Add Sale
      </button>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium">Add Manual Sale</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-gray-500"
        >
          Cancel
        </button>
      </div>

      {/* Add date selector before product selection */}
      <div className="mb-4">
        <label className="text-sm mb-1 block">Date</label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full"
        />
      </div>

      {/* Product Selection */}
      <div className="space-y-4 mb-4">
        <div className="relative">
          <Input
            type="text"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search for a product..."
            className="w-full"
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

        {/* Selected Products List */}
        <div className="space-y-2">
          {selectedProducts.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                className="w-20"
              />
              <span className="flex-grow">{item.name}</span>
              <span>${item.totalPrice.toFixed(2)}</span>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => handleRemoveProduct(index)}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Additional Details */}
      <div className="space-y-2 mb-4">
        <Input
          placeholder="Customer name"
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
        />
        <Input
          placeholder="Payment method"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
        />
        <div>
          <label className="text-sm mb-1 block">Shipping Amount ($)</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={shippingAmount}
            onChange={(e) => {
              setShippingAmount(parseFloat(e.target.value) || 0)
              setManualTotal(null) // Reset manual total when shipping changes
            }}
          />
        </div>
        <div>
          <label className="text-sm mb-1 block">Total Amount ($)</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={manualTotal ?? finalTotal}
            onChange={(e) => setManualTotal(parseFloat(e.target.value) || 0)}
            className={manualTotal !== null ? "border-blue-500" : ""}
          />
        </div>
      </div>

      {/* Totals */}
      <div className="space-y-1 mb-4 text-sm">
        <div className="flex justify-between">
          <span>Products Subtotal:</span>
          <span>${productsSubtotal.toFixed(2)}</span>
        </div>
        {shippingAmount > 0 && (
          <div className="flex justify-between">
            <span>Shipping:</span>
            <span>+${shippingAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-medium">
          <span>Taxable Subtotal:</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        {tip > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Tip:</span>
            <span>+${tip.toFixed(2)}</span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between text-red-600">
            <span>Discount:</span>
            <span>-${discount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-medium">
          <span>Final Total:</span>
          <span>${finalTotal.toFixed(2)}</span>
        </div>
      </div>

      <Button 
        onClick={handleSubmit} 
        disabled={loading || selectedProducts.length === 0}
        className="w-full"
      >
        {loading ? 'Adding...' : 'Add Sale'}
      </Button>
    </Card>
  )
} 