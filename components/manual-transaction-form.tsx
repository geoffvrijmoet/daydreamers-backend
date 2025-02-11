'use client'

import { useState, useEffect, useMemo } from 'react'
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
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.toISOString().split('.')[0]}`; // Format: "YYYY-MM-DDTHH:mm:ss"
  })

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

  // Filter and group products based on search query
  const filteredAndGroupedProducts = useMemo(() => {
    const filtered = products.filter(product => 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Group by parent product name (everything before " - ")
    return filtered.reduce((groups, product) => {
      const parentName = product.name.split(' - ')[0]
      if (!groups[parentName]) {
        groups[parentName] = []
      }
      groups[parentName].push(product)
      return groups
    }, {} as Record<string, Product[]>)
  }, [products, searchQuery])

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
    const TAX_RATE = 0.08875;
    
    // Products total (including tax)
    const productsWithTax = selectedProducts.reduce((sum, item) => sum + item.totalPrice, 0);
    
    // Work backwards to get pre-tax amount for products
    const productsPreTax = productsWithTax / (1 + TAX_RATE);
    const productsTaxAmount = productsWithTax - productsPreTax;
    
    // Add shipping (shipping is taxable)
    const shippingPreTax = shippingAmount;
    const shippingTax = shippingPreTax * TAX_RATE;
    const shippingWithTax = shippingPreTax + shippingTax;
    
    // Total amounts
    const totalPreTax = productsPreTax + shippingPreTax;
    const totalTax = productsTaxAmount + shippingTax;
    const subtotalWithTax = productsWithTax + shippingWithTax; // Total with tax before tip/discount
    
    // Handle manual total override (for tips/discounts)
    const finalTotal = manualTotal ?? subtotalWithTax;
    const adjustment = finalTotal - subtotalWithTax;

    return { 
      productsWithTax,
      productsPreTax,
      shipping: shippingAmount,
      totalPreTax, // Total pre-tax amount (products + shipping)
      totalTax, // Total tax amount
      subtotalWithTax, // What customer pays (includes tax but not tip)
      finalTotal,
      tip: adjustment > 0 ? adjustment : 0,
      discount: adjustment < 0 ? -adjustment : 0
    }
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)
      const { totalPreTax, finalTotal, tip, discount, totalTax } = calculateTotals()

      const response = await fetch('/api/transactions/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sale',
          date,
          amount: finalTotal,
          productsTotal: totalPreTax - shippingAmount, // Pre-tax products total
          preTaxAmount: totalPreTax, // Total pre-tax amount (products + shipping)
          taxAmount: totalTax,
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
      setShippingAmount(0)

    } catch (error) {
      console.error('Error creating transaction:', error)
    } finally {
      setLoading(false)
    }
  }

  const { productsWithTax, productsPreTax, shipping, totalPreTax, totalTax, subtotalWithTax, finalTotal, tip, discount } = calculateTotals()

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-violet-400 hover:bg-violet-500"
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

      {/* Add date and time selector before product selection */}
      <div className="mb-4">
        <label className="text-sm mb-1 block">Date and Time</label>
        <Input
          type="datetime-local"
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
              {Object.keys(filteredAndGroupedProducts).length > 0 ? (
                Object.entries(filteredAndGroupedProducts).map(([parentName, variants]) => (
                  <div key={parentName} className="border-b last:border-b-0 border-gray-200 dark:border-gray-700">
                    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">{parentName}</h3>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {variants.map(product => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => handleProductSelect(product)}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <div className="text-sm text-gray-600 dark:text-gray-300">
                            {product.name.split(' - ')[1] || 'Default'}
                          </div>
                          <div className="text-xs text-gray-500">
                            SKU: {product.sku} - ${(product.retailPrice || 0).toFixed(2)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
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
          <span>Products Total (with tax):</span>
          <span>${productsWithTax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-gray-500 text-xs">
          <span className="pl-4">Products (pre-tax):</span>
          <span>${productsPreTax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-gray-500 text-xs">
          <span className="pl-4">Products Tax:</span>
          <span>${(productsWithTax - productsPreTax).toFixed(2)}</span>
        </div>
        {shipping > 0 && (
          <>
            <div className="flex justify-between">
              <span>Shipping:</span>
              <span>+${shipping.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-500 text-xs">
              <span className="pl-4">Shipping Tax:</span>
              <span>+${(shipping * 0.08875).toFixed(2)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between border-t pt-1">
          <span>Pre-tax Amount:</span>
          <span>${totalPreTax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Sales Tax (8.875%):</span>
          <span>+${totalTax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-medium">
          <span>Subtotal with Tax:</span>
          <span>${subtotalWithTax.toFixed(2)}</span>
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
        <div className="flex justify-between font-medium border-t pt-1">
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