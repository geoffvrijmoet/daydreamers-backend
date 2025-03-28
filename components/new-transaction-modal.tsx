'use client'

import { useState, useEffect } from 'react'
import { Product } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type TransactionType = 'sale' | 'expense' | 'training'

type Source = 'manual' | 'shopify' | 'square' | 'amex'

interface LineItem {
  productId: string | undefined
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
  isTaxable: boolean
}

interface BaseTransactionFormData {
  type: TransactionType
  date: string
  amount: number
  source: Source
  paymentMethod: string
  notes?: string
}

interface SaleFormData extends BaseTransactionFormData {
  type: 'sale'
  customer: string
  email: string
  isTaxable: boolean
  preTaxAmount: number
  taxAmount: number
  products: LineItem[]
  tip: number
  discount: number
  shipping: number
}

interface ExpenseFormData extends BaseTransactionFormData {
  type: 'expense'
  expenseType: string
  expenseLabel: string
  supplier: string
  supplierOrderNumber: string
}

interface TrainingFormData extends BaseTransactionFormData {
  type: 'training'
  trainer: string
  clientName: string
  dogName: string
  sessionNotes: string
  revenue: number
  trainingAgency: string
}

type TransactionFormData = SaleFormData | ExpenseFormData | TrainingFormData

type NewSaleModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function NewSaleModal({ open, onOpenChange, onSuccess }: NewSaleModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [formData, setFormData] = useState<TransactionFormData>({
    type: 'sale',
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    source: 'manual' as Source,
    paymentMethod: 'Venmo',
    customer: '',
    email: '',
    isTaxable: true,
    preTaxAmount: 0,
    taxAmount: 0,
    products: [],
    tip: 0,
    discount: 0,
    shipping: 0,
  })
  const [customerSuggestions, setCustomerSuggestions] = useState<string[]>([])
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setFormData({
        type: 'sale',
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        source: 'manual' as Source,
        paymentMethod: 'Venmo',
        customer: '',
        email: '',
        isTaxable: true,
        preTaxAmount: 0,
        taxAmount: 0,
        products: [],
        tip: 0,
        discount: 0,
        shipping: 0,
      })
    }
  }, [open])

  // Fetch products on component mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch('/api/products?limit=1000')
        
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to fetch products: ${response.status} ${errorText.substring(0, 100)}`)
        }
        
        const data = await response.json()
        
        if (!data.products || !Array.isArray(data.products)) {
          throw new Error('Invalid response format')
        }
        
        const activeProducts = data.products.filter((p: Product) => p.active)
        setProducts(activeProducts)
        setFilteredProducts(activeProducts)
      } catch (error) {
        console.error('Error fetching products:', error)
      }
    }
    
    fetchProducts()
  }, [])

  // Calculate totals whenever products change
  useEffect(() => {
    if (formData.type === 'sale') {
      const TAX_RATE = 0.08875;
      
      // Products total (including tax)
      const productsWithTax = formData.products.reduce((sum, item) => sum + item.totalPrice, 0);
      
      // Work backwards to get pre-tax amount for products
      const productsPreTax = productsWithTax / (1 + TAX_RATE);
      const productsTaxAmount = productsWithTax - productsPreTax;
      
      // Add shipping (shipping is taxable)
      const shippingPreTax = formData.shipping;
      const shippingTax = shippingPreTax * TAX_RATE;
      const shippingWithTax = shippingPreTax + shippingTax;
      
      // Total amounts
      const totalPreTax = productsPreTax + shippingPreTax;
      const totalTax = productsTaxAmount + shippingTax;
      const subtotalWithTax = productsWithTax + shippingWithTax; // Total with tax before tip/discount
      
      // Handle manual total override (for tips/discounts)
      const finalTotal = formData.amount || subtotalWithTax;
      const adjustment = finalTotal - subtotalWithTax;

      setFormData(prev => ({
        ...prev,
        preTaxAmount: parseFloat(totalPreTax.toFixed(2)),
        taxAmount: parseFloat(totalTax.toFixed(2)),
        tip: adjustment > 0 ? adjustment : 0,
        discount: adjustment < 0 ? -adjustment : 0,
        amount: parseFloat(finalTotal.toFixed(2))
      }))
    }
  }, [formData.type === 'sale' ? formData.products : null, formData.type === 'sale' ? formData.shipping : null, formData.type === 'sale' ? formData.amount : null])

  // Fetch customer suggestions when typing
  useEffect(() => {
    async function fetchCustomers() {
      if (formData.type === 'sale' && (formData as SaleFormData).customer.length < 2) {
        setCustomerSuggestions([]);
        return;
      }
      
      try {
        const response = await fetch(`/api/customers/search?query=${encodeURIComponent((formData as SaleFormData).customer)}`)
        if (!response.ok) throw new Error('Failed to fetch customers')
        const data = await response.json()
        setCustomerSuggestions(data.customers.map((c: { name: string }) => c.name));
      } catch (error) {
        console.error('Error fetching customers:', error)
        setCustomerSuggestions([]);
      }
    }
    
    const delayDebounceFn = setTimeout(() => {
      fetchCustomers();
    }, 300);
    
    return () => clearTimeout(delayDebounceFn);
  }, [formData.type === 'sale' ? (formData as SaleFormData).customer : null]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // Create a date object from the form date and set it to 9 AM UTC
      const date = new Date(formData.date);
      date.setUTCHours(9, 0, 0, 0);

      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          date: date.toISOString()
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create transaction')
      }

      // Reset form and close modal
      setFormData({
        type: 'sale',
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        source: 'manual' as Source,
        paymentMethod: 'Venmo',
        customer: '',
        email: '',
        isTaxable: true,
        preTaxAmount: 0,
        taxAmount: 0,
        products: [],
        tip: 0,
        discount: 0,
        shipping: 0,
      })
      onOpenChange(false)
      if (onSuccess) onSuccess()
    } catch (error) {
      console.error('Error creating transaction:', error)
    }
  }

  const handleTypeChange = (type: TransactionType) => {
    const baseData = {
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      source: 'manual' as Source,
      paymentMethod: 'Venmo',
    }

    switch (type) {
      case 'sale':
        setFormData({
          type: 'sale',
          ...baseData,
          customer: '',
          email: '',
          isTaxable: true,
          preTaxAmount: 0,
          taxAmount: 0,
          products: [],
          tip: 0,
          discount: 0,
          shipping: 0,
        } as SaleFormData)
        break
      case 'expense':
        setFormData({
          type: 'expense',
          ...baseData,
          expenseType: '',
          expenseLabel: '',
          supplier: '',
          supplierOrderNumber: '',
        } as ExpenseFormData)
        break
      case 'training':
        setFormData({
          type: 'training',
          ...baseData,
          trainer: '',
          clientName: '',
          dogName: '',
          sessionNotes: '',
          revenue: 0,
          trainingAgency: '',
        } as TrainingFormData)
        break
    }
  }

  const handleAddProduct = (product: Product) => {
    if (formData.type !== 'sale') return;
    
    if (!product._id) {
      console.error('Product missing _id field:', product);
      return;
    }

    const newProduct: LineItem = {
      productId: product._id,
      name: product.name,
      quantity: 1,
      unitPrice: product.price,
      totalPrice: product.price,
      isTaxable: true
    }

    setFormData(prev => ({
      ...prev,
      products: [...(prev as SaleFormData).products, newProduct],
      tip: 0,
      discount: 0,
      amount: 0 // Reset amount to trigger recalculation
    }))
  }

  const handleUpdateProductQuantity = (index: number, quantity: number) => {
    if (formData.type !== 'sale') return;
    
    setFormData(prev => {
      const products = [...(prev as SaleFormData).products]
      products[index] = {
        ...products[index],
        quantity,
        totalPrice: products[index].unitPrice * quantity
      }
      return {
        ...prev,
        products,
        tip: 0,
        discount: 0,
        amount: 0 // Reset amount to trigger recalculation
      }
    })
  }

  const handleRemoveProduct = (index: number) => {
    if (formData.type === 'sale') {
      const saleFormData = formData as SaleFormData
      setFormData({
        ...saleFormData,
        products: saleFormData.products.filter((_, i) => i !== index),
      } as SaleFormData)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>New Transaction</span>
            
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Transaction Type Selection */}
          <div className="flex space-x-4 mb-6">
            <button
              type="button"
              onClick={() => handleTypeChange('sale')}
              className={`px-4 py-2 rounded ${
                formData.type === 'sale'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Sale
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('expense')}
              className={`px-4 py-2 rounded ${
                formData.type === 'expense'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('training')}
              className={`px-4 py-2 rounded ${
                formData.type === 'training'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Training
            </button>
          </div>

          {/* Common Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Payment Method</label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              >
                <option value="Venmo">Venmo</option>
                <option value="Cash">Cash</option>
                <option value="Cash App">Cash App</option>
                <option value="Zelle">Zelle</option>
              </select>
            </div>
          </div>

          {/* Type-specific Fields */}
          {formData.type === 'sale' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Sale Details</h2>
              
              {/* Customer Input */}
              <div className="mb-4 relative">
                <label className="text-sm mb-1 block">Customer</label>
                <Input
                  type="text"
                  value={(formData as SaleFormData).customer}
                  onChange={(e) => {
                    setFormData(prev => ({
                      ...prev,
                      customer: e.target.value
                    }))
                  }}
                  onFocus={() => setShowCustomerSuggestions(true)}
                  placeholder="Enter customer name"
                  className="w-full"
                />
                {showCustomerSuggestions && customerSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-60 overflow-y-auto">
                    {customerSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            customer: suggestion
                          }))
                          setShowCustomerSuggestions(false);
                        }}
                        className="p-2 hover:bg-gray-100 cursor-pointer"
                      >
                        {suggestion}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Product Selection */}
              <div className="space-y-4">
                <h3 className="text-md font-medium">Add Products</h3>
                <div>
                  <input
                    type="text"
                    placeholder="Search products by name or SKU..."
                    onChange={(e) => {
                      const searchTerm = e.target.value.toLowerCase()
                      const filtered = products.filter(p => 
                        p.name.toLowerCase().includes(searchTerm) ||
                        (p.sku?.toLowerCase() || '').includes(searchTerm)
                      )
                      setFilteredProducts(filtered)
                    }}
                    className="w-full px-4 py-2 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                {/* Product List */}
                <div className="max-h-[300px] overflow-y-auto space-y-1">
                  {filteredProducts.map((product) => (
                    <div
                      key={product._id}
                      className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleAddProduct(product)}
                    >
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-sm text-gray-500">SKU: {product.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">${(product.price || 0).toFixed(2)}</div>
                        <div className="text-sm text-gray-500">Stock: {product.stock}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Selected Products */}
                {formData.products.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Selected Products</h4>
                    {formData.products.map((product, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={product.quantity}
                          onChange={(e) => handleUpdateProductQuantity(index, parseInt(e.target.value) || 1)}
                          className="w-20 px-2 py-1 border rounded"
                        />
                        <span className="flex-grow">{product.name}</span>
                        <span>${product.totalPrice.toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveProduct(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Additional Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Shipping Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.shipping}
                      onChange={(e) => setFormData(prev => ({ ...prev, shipping: parseFloat(e.target.value) || 0 }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Tip ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.tip}
                      onChange={(e) => setFormData(prev => ({ ...prev, tip: parseFloat(e.target.value) || 0 }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Discount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.discount}
                      onChange={(e) => setFormData(prev => ({ ...prev, discount: parseFloat(e.target.value) || 0 }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Taxable</label>
                    <div className="mt-1">
                      <label className="inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.isTaxable}
                          onChange={(e) => setFormData(prev => ({ ...prev, isTaxable: e.target.checked }))}
                          className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                        <span className="ml-2">Apply tax</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Totals */}
                <div className="space-y-4 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm mb-1 block">Revenue Total</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={(formData as SaleFormData).amount}
                        onChange={(e) => {
                          const newTotal = parseFloat(e.target.value) || 0;
                          const TAX_RATE = 0.08875;
                          
                          // Calculate new pre-tax and tax amounts based on the new total
                          const newPreTax = newTotal / (1 + TAX_RATE);
                          const newTax = newTotal - newPreTax;
                          
                          setFormData(prev => ({
                            ...prev,
                            amount: newTotal,
                            preTaxAmount: parseFloat(newPreTax.toFixed(2)),
                            taxAmount: parseFloat(newTax.toFixed(2))
                          }))
                        }}
                        className="w-full"
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        Pre-tax: ${((formData as SaleFormData).preTaxAmount).toFixed(2)}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm mb-1 block">Sales Tax (8.875%)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={(formData as SaleFormData).taxAmount.toFixed(2)}
                        readOnly
                        className="w-full bg-gray-50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm mb-1 block">Shipping</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={(formData as SaleFormData).shipping}
                        onChange={(e) => {
                          const newShipping = parseFloat(e.target.value) || 0;
                          setFormData(prev => ({
                            ...prev,
                            shipping: newShipping
                          }))
                        }}
                        className="w-full"
                      />
                    </div>

                   
                  </div>
                </div>
              </div>
            </div>
          )}

          {formData.type === 'expense' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Expense Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Expense Type</label>
                  <input
                    type="text"
                    value={formData.expenseType || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, expenseType: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Expense Label</label>
                  <input
                    type="text"
                    value={formData.expenseLabel || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, expenseLabel: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Supplier</label>
                  <input
                    type="text"
                    value={formData.supplier || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {formData.type === 'training' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Training Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Trainer</label>
                  <input
                    type="text"
                    value={formData.trainer || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, trainer: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Client Name</label>
                  <input
                    type="text"
                    value={formData.clientName || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Dog Name</label>
                  <input
                    type="text"
                    value={formData.dogName || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, dogName: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Training Agency</label>
                  <input
                    type="text"
                    value={formData.trainingAgency || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, trainingAgency: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notes Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Create Transaction
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
} 