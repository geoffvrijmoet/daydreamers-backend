'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type TransactionType = 'sale' | 'expense' | 'training';

interface Product {
  _id: string;
  name: string;
  price: number;
  sku: string;
}

interface LineItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isTaxable: boolean;
}

interface TransactionFormData {
  type: TransactionType;
  date: string;
  amount: number;
  source: 'manual' | 'shopify' | 'square' | 'amex';
  paymentMethod?: string;
  notes?: string;
  // Sale specific fields
  customer?: string;
  email?: string;
  isTaxable?: boolean;
  preTaxAmount?: number;
  taxAmount?: number;
  products?: LineItem[];
  tip?: number;
  discount?: number;
  shipping?: number;
  // Expense specific fields
  expenseType?: string;
  expenseLabel?: string;
  supplier?: string;
  supplierOrderNumber?: string;
  // Training specific fields
  trainer?: string;
  clientName?: string;
  dogName?: string;
  sessionNotes?: string;
  revenue?: number;
  trainingAgency?: string;
}

export default function NewTransactionPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState<TransactionFormData>({
    type: 'sale',
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    source: 'manual',
    isTaxable: false,
    preTaxAmount: 0,
    taxAmount: 0,
    products: [],
  });

  // Fetch products on component mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch('/api/products');
        if (!response.ok) throw new Error('Failed to fetch products');
        const data = await response.json();
        setProducts(data.products);
      } catch (error) {
        console.error('Error fetching products:', error);
      }
    };
    fetchProducts();
  }, []);

  // Calculate totals whenever products change
  useEffect(() => {
    if (formData.type === 'sale' && formData.products) {
      const subtotal = formData.products.reduce((sum, item) => sum + item.totalPrice, 0);
      const tax = formData.isTaxable ? subtotal * 0.08 : 0; // 8% tax rate
      const total = subtotal + tax + (formData.tip || 0) + (formData.shipping || 0) - (formData.discount || 0);
      
      setFormData(prev => ({
        ...prev,
        preTaxAmount: subtotal,
        taxAmount: tax,
        amount: total,
      }));
    }
  }, [formData.products, formData.isTaxable, formData.tip, formData.shipping, formData.discount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to create transaction');
      }

      router.push('/transactions');
    } catch (error) {
      console.error('Error creating transaction:', error);
      // TODO: Add proper error handling UI
    }
  };

  const handleTypeChange = (type: TransactionType) => {
    setFormData(prev => ({
      ...prev,
      type,
      // Reset type-specific fields
      customer: undefined,
      email: undefined,
      isTaxable: undefined,
      preTaxAmount: undefined,
      taxAmount: undefined,
      products: undefined,
      tip: undefined,
      discount: undefined,
      shipping: undefined,
      expenseType: undefined,
      expenseLabel: undefined,
      supplier: undefined,
      supplierOrderNumber: undefined,
      trainer: undefined,
      clientName: undefined,
      dogName: undefined,
      sessionNotes: undefined,
      revenue: undefined,
      trainingAgency: undefined,
    }));
  };

  const handleAddProduct = (product: Product) => {
    setFormData(prev => ({
      ...prev,
      products: [
        ...(prev.products || []),
        {
          productId: product._id,
          name: product.name,
          quantity: 1,
          unitPrice: product.price,
          totalPrice: product.price,
          isTaxable: true,
        },
      ],
    }));
  };

  const handleUpdateProductQuantity = (index: number, quantity: number) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products?.map((item, i) => 
        i === index 
          ? { ...item, quantity, totalPrice: item.unitPrice * quantity }
          : item
      ),
    }));
  };

  const handleRemoveProduct = (index: number) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products?.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Create New Transaction</h1>
      
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
            <label className="block text-sm font-medium text-gray-700">Amount</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Source</label>
            <select
              value={formData.source}
              onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value as 'manual' | 'shopify' | 'square' | 'amex' }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            >
              <option value="manual">Manual</option>
              <option value="shopify">Shopify</option>
              <option value="square">Square</option>
              <option value="amex">Amex</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Payment Method</label>
            <input
              type="text"
              value={formData.paymentMethod || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Type-specific Fields */}
        {formData.type === 'sale' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Sale Details</h2>
            
            {/* Product Selection */}
            <div className="space-y-4">
              <h3 className="text-md font-medium">Add Products</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {products.map(product => (
                  <div
                    key={product._id}
                    className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleAddProduct(product)}
                  >
                    <div className="font-medium">{product.name}</div>
                    <div className="text-sm text-gray-500">SKU: {product.sku}</div>
                    <div className="text-sm font-medium">${product.price.toFixed(2)}</div>
                  </div>
                ))}
              </div>

              {/* Selected Products */}
              {formData.products && formData.products.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-md font-medium mb-2">Selected Products</h3>
                  <div className="space-y-2">
                    {formData.products.map((product, index) => (
                      <div key={index} className="flex items-center space-x-4 p-2 bg-gray-50 rounded">
                        <div className="flex-1">
                          <div className="font-medium">{product.name}</div>
                          <div className="text-sm text-gray-500">${product.unitPrice.toFixed(2)} each</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            min="1"
                            value={product.quantity}
                            onChange={(e) => handleUpdateProductQuantity(index, parseInt(e.target.value))}
                            className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                          <div className="font-medium">${product.totalPrice.toFixed(2)}</div>
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Customer Name</label>
                <input
                  type="text"
                  value={formData.customer || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, customer: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Pre-tax Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.preTaxAmount || 0}
                  onChange={(e) => setFormData(prev => ({ ...prev, preTaxAmount: parseFloat(e.target.value) }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Tax Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.taxAmount || 0}
                  onChange={(e) => setFormData(prev => ({ ...prev, taxAmount: parseFloat(e.target.value) }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Tip</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.tip || 0}
                  onChange={(e) => setFormData(prev => ({ ...prev, tip: parseFloat(e.target.value) }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Shipping</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.shipping || 0}
                  onChange={(e) => setFormData(prev => ({ ...prev, shipping: parseFloat(e.target.value) }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Discount</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.discount || 0}
                  onChange={(e) => setFormData(prev => ({ ...prev, discount: parseFloat(e.target.value) }))}
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
              <div>
                <label className="block text-sm font-medium text-gray-700">Order Number</label>
                <input
                  type="text"
                  value={formData.supplierOrderNumber || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, supplierOrderNumber: e.target.value }))}
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
    </div>
  );
} 