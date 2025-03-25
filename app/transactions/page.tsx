'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type TransactionType = 'sale' | 'expense' | 'training';

interface Product {
  _id: string;
  name: string;
  baseProductName: string;
  variantName: string;
  price: number;
  sku: string;
  stock: number;
  active: boolean;
  category: string;
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
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<TransactionFormData>({
    type: 'sale',
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    source: 'manual',
    isTaxable: true,
    preTaxAmount: 0,
    taxAmount: 0,
    products: [],
  });

  // Fetch products on component mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setIsLoading(true);
        setError(null);
        console.log('Fetching products...');
        const response = await fetch('/api/products?limit=1000'); // Set high limit to get all products
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API Error:', response.status, errorText);
          throw new Error(`Failed to fetch products: ${response.status} ${errorText.substring(0, 100)}`);
        }
        
        console.log('Parsing response...');
        const data = await response.json();
        console.log('API response:', data);
        
        if (!data.products || !Array.isArray(data.products)) {
          console.error('Invalid response format:', data);
          throw new Error('Invalid response format');
        }
        
        const activeProducts = data.products.filter((p: Product) => p.active);
        setProducts(activeProducts);
        setFilteredProducts(activeProducts);
        console.log('Products loaded:', activeProducts.length);
      } catch (error) {
        console.error('Error fetching products:', error);
        setError(`Failed to load products: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProducts();
  }, []);

  // Calculate totals whenever products change
  useEffect(() => {
    if (formData.type === 'sale' && formData.products) {
      const TAX_RATE = 0.08875; // 8.875%
      
      // Since retail prices include tax, we need to back it out
      const totalWithTax = formData.products.reduce((sum, item) => sum + item.totalPrice, 0);
      
      let subtotal, tax;
      if (formData.isTaxable) {
        // Back out tax from the total: total = subtotal * (1 + TAX_RATE)
        subtotal = totalWithTax / (1 + TAX_RATE);
        tax = totalWithTax - subtotal;
      } else {
        subtotal = totalWithTax;
        tax = 0;
      }
      
      const total = subtotal + tax + (formData.tip || 0) + (formData.shipping || 0) - (formData.discount || 0);
      
      setFormData(prev => ({
        ...prev,
        preTaxAmount: parseFloat(subtotal.toFixed(2)),
        taxAmount: parseFloat(tax.toFixed(2)),
        amount: parseFloat(total.toFixed(2)),
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
              <div>
                <input
                  type="text"
                  placeholder="Search products by name or SKU..."
                  onChange={(e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    const filtered = products.filter(p => 
                      p.name.toLowerCase().includes(searchTerm) ||
                      p.sku.toLowerCase().includes(searchTerm)
                    );
                    setFilteredProducts(filtered);
                  }}
                  className="w-full px-4 py-2 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              {isLoading ? (
                <div className="p-4 border rounded bg-gray-50 text-center">
                  <p>Loading products...</p>
                </div>
              ) : error ? (
                <div className="p-4 border rounded bg-red-50 text-red-700">
                  <p>{error}</p>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsLoading(true);
                      setError(null);
                      fetch('/api/test')
                        .then(res => res.json())
                        .then(data => {
                          console.log('Test API response:', data);
                          fetch('/api/products')
                            .then(res => {
                              console.log('Products API status:', res.status);
                              return res.json();
                            })
                            .then(data => {
                              console.log('Products API data:', data);
                              const activeProducts = data.products?.filter((p: Product) => p.active) || [];
                              setProducts(activeProducts);
                              setFilteredProducts(activeProducts);
                              setIsLoading(false);
                            })
                            .catch(err => {
                              console.error('Products API error:', err);
                              setError('Failed to fetch products: ' + String(err));
                              setIsLoading(false);
                            });
                        })
                        .catch(err => {
                          console.error('Test API error:', err);
                          setError('Test API failed: ' + String(err));
                          setIsLoading(false);
                        });
                    }}
                    className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Retry
                  </button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-4 border rounded bg-yellow-50 text-yellow-700">
                  <p>No products found.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg">
                  {filteredProducts.map(product => (
                    <div
                      key={product._id}
                      className="p-4 hover:bg-gray-50 cursor-pointer transition-colors border-b last:border-b-0"
                      onClick={() => handleAddProduct(product)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">{product.name}</div>
                          <div className="text-sm text-gray-500">SKU: {product.sku}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">${(product.price || 0).toFixed(2)}</div>
                          <div className="text-sm text-gray-500">Stock: {product.stock}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Selected Products */}
              {formData.products && formData.products.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-md font-medium mb-2">Selected Products</h3>
                  <div className="space-y-2">
                    {formData.products.map((product, index) => (
                      <div key={index} className="flex items-center space-x-4 p-2 bg-gray-50 rounded">
                        <div className="flex-1">
                          <div className="font-medium">{product.name}</div>
                          <div className="text-sm text-gray-500">${(product.unitPrice || 0).toFixed(2)} each</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            min="1"
                            value={product.quantity}
                            onChange={(e) => handleUpdateProductQuantity(index, parseInt(e.target.value))}
                            className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                          <div className="font-medium">${(product.totalPrice || 0).toFixed(2)}</div>
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