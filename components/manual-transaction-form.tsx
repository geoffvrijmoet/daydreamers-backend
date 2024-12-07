'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Product } from '@/types'

type SelectedProduct = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export function ManualTransactionForm() {
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([])
  const [customer, setCustomer] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [manualTotal, setManualTotal] = useState<number | null>(null)

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

  const handleAddProduct = (productId: string) => {
    const product = products.find(p => p.id === productId)
    if (!product) return

    setSelectedProducts(prev => [...prev, {
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPrice: product.retailPrice,
      totalPrice: product.retailPrice
    }])
    setManualTotal(null) // Reset manual total when products change
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
    const subtotal = selectedProducts.reduce((sum, item) => sum + item.totalPrice, 0)
    const finalTotal = manualTotal ?? subtotal
    const adjustment = finalTotal - subtotal // This will be positive for tips, negative for discounts

    return { 
      subtotal, 
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
          amount: finalTotal,
          productsTotal: subtotal,
          products: selectedProducts,
          tip: tip || undefined,
          discount: discount || undefined,
          customer,
          paymentMethod,
          source: 'manual',
          date: new Date().toISOString()
        })
      })

      if (!response.ok) throw new Error('Failed to create transaction')

      // Reset form
      setSelectedProducts([])
      setManualTotal(null)
      setCustomer('')
      setPaymentMethod('')

    } catch (error) {
      console.error('Error creating transaction:', error)
    } finally {
      setLoading(false)
    }
  }

  const { subtotal, finalTotal, tip, discount } = calculateTotals()

  return (
    <Card className="p-4">
      <h3 className="font-medium mb-4">Add Manual Sale</h3>

      {/* Product Selection */}
      <div className="space-y-4 mb-4">
        <Select onValueChange={handleAddProduct}>
          <SelectTrigger>
            <SelectValue placeholder="Add product..." />
          </SelectTrigger>
          <SelectContent>
            {products.map(product => (
              <SelectItem key={product.id} value={product.id}>
                {product.name} - ${product.retailPrice.toFixed(2)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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