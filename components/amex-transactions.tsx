'use client'

import { useState, useEffect } from 'react'
import { Card } from "@/components/ui/card"
import { EmailTransaction } from '@/types'
import { Product } from '@/types'

// Add new type for the JSON structure
type ProductJson = {
  [key: string]: {
    name: string;
    count?: string;
    qty?: string;
    spend: string;
  }
}

// Add new type for unmatched products
type UnmatchedProduct = {
  name: string;
  quantity: number;
  totalPrice: number;
  matched?: boolean;
}

// Add function to parse JSON input
const parseProductJson = (jsonString: string) => {
  try {
    let processedString = jsonString;
    
    if (processedString.startsWith('"') && processedString.endsWith('"')) {
      processedString = processedString.slice(1, -1);
    }
    
    processedString = processedString.replace(/""/g, '"');
    
    const data: ProductJson = JSON.parse(processedString);
    
    // Convert to our product format, handling both count and qty
    return Object.values(data).map(item => ({
      name: item.name,
      quantity: parseInt(item.count || item.qty || '1'),
      totalPrice: parseFloat(item.spend)
    }));
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return null;
  }
};

export function AmexTransactions() {
  const [savedTransactions, setSavedTransactions] = useState<EmailTransaction[]>([])
  const [newTransactions, setNewTransactions] = useState<EmailTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<{ [key: string]: boolean }>({})
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState<{ [key: string]: boolean }>({})
  const [products, setProducts] = useState<Product[]>([])
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [quantity, setQuantity] = useState<number>(1)
  const [jsonInput, setJsonInput] = useState<{ [key: string]: string }>({});
  const [unmatchedProducts, setUnmatchedProducts] = useState<{ [key: string]: UnmatchedProduct[] }>({});
  const [productSearchQueries, setProductSearchQueries] = useState<{ [key: string]: string }>({});
  const [activeSearchProduct, setActiveSearchProduct] = useState<string | null>(null);
  const [globalJsonInput, setGlobalJsonInput] = useState('');
  const [editingSavedTransaction, setEditingSavedTransaction] = useState<string | null>(null);
  const [editingSavedProductId, setEditingSavedProductId] = useState<string | null>(null);

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

  async function fetchSavedTransactions() {
    try {
      setLoading(true)
      const response = await fetch('/api/transactions?source=gmail&type=purchase')
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch transactions')
      }
      
      const data = await response.json()
      setSavedTransactions(data.transactions || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load transactions'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    try {
      setSyncing(true)
      const response = await fetch('/api/gmail/amex/fetch', {
        method: 'POST'
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to sync transactions')
      }
      
      const data = await response.json()
      setNewTransactions(data.transactions || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sync transactions'
      setError(errorMessage)
    } finally {
      setSyncing(false)
    }
  }

  const handleSaveTransaction = async (transaction: EmailTransaction) => {
    try {
      setSaving(prev => ({ ...prev, [transaction.id]: true }))
      
      const response = await fetch('/api/gmail/amex/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction)
      })

      if (!response.ok) {
        throw new Error('Failed to save transaction')
      }

      // Remove from new transactions and add to saved transactions
      setNewTransactions(prev => prev.filter(t => t.id !== transaction.id))
      await fetchSavedTransactions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction')
    } finally {
      setSaving(prev => ({ ...prev, [transaction.id]: false }))
    }
  }

  const handleCheckboxChange = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === savedTransactions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(savedTransactions.map(t => t.id)))
    }
  }

  const handleDelete = async (transactionId: string) => {
    try {
      setDeleting(prev => ({ ...prev, [transactionId]: true }))
      
      const response = await fetch('/api/gmail/amex', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transactionId })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to delete transaction')
      }

      // Remove from transactions list
      setNewTransactions(prev => prev.filter(t => t.id !== transactionId))
      setSavedTransactions(prev => prev.filter(t => t.id !== transactionId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete transaction')
    } finally {
      setDeleting(prev => ({ ...prev, [transactionId]: false }))
    }
  }

  const handleAddProduct = (transactionId: string, product: Product, quantity: number = 1) => {
    setNewTransactions(prev => prev.map(t => {
      if (t.id === transactionId) {
        const products = t.products || []
        return {
          ...t,
          products: [
            ...products,
            {
              productId: product.id,
              name: product.name,
              quantity,
              unitPrice: product.lastPurchasePrice,
              totalPrice: product.lastPurchasePrice * quantity
            }
          ]
        }
      }
      return t
    }))
  }

  const handleUpdateProductQuantity = (transactionId: string, productIndex: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    
    setNewTransactions(prev => prev.map(t => {
      if (t.id === transactionId && t.products) {
        const updatedProducts = [...t.products];
        const product = updatedProducts[productIndex];
        
        updatedProducts[productIndex] = {
          ...product,
          quantity: newQuantity,
          totalPrice: product.unitPrice * newQuantity
        };

        return {
          ...t,
          products: updatedProducts
        };
      }
      return t;
    }));
  }

  const handleUpdateProductPrice = (transactionId: string, productIndex: number, newUnitPrice: number) => {
    if (newUnitPrice < 0) return;
    
    setNewTransactions(prev => prev.map(t => {
      if (t.id === transactionId && t.products) {
        const updatedProducts = [...t.products];
        const product = updatedProducts[productIndex];
        
        updatedProducts[productIndex] = {
          ...product,
          unitPrice: newUnitPrice,
          totalPrice: newUnitPrice * product.quantity
        };

        return {
          ...t,
          products: updatedProducts
        };
      }
      return t;
    }));
  }

  const handleSetSupplier = (transactionId: string, supplier: string) => {
    setNewTransactions(prev => prev.map(t => {
      if (t.id === transactionId) {
        return {
          ...t,
          supplier
        }
      }
      return t
    }))
  }

  // Filter products based on search query
  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleProductSelect = (transactionId: string, product: Product) => {
    handleAddProduct(transactionId, product, quantity)
    setSearchQuery('')
    setShowSuggestions(false)
    setQuantity(1)
  }

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity < 1) return
    setQuantity(newQuantity)
  }

  useEffect(() => {
    fetchSavedTransactions()
  }, [])

  // Add function to calculate products total
  const calculateProductsTotal = (products: any[]) => {
    return products?.reduce((sum, product) => sum + product.totalPrice, 0) || 0;
  };

  // Add function to calculate difference
  const calculateDifference = (transaction: EmailTransaction) => {
    const productsTotal = calculateProductsTotal(transaction.products);
    return transaction.amount - productsTotal;
  };

  // Add function to handle JSON input
  const handleJsonInput = (transactionId: string, input: string) => {
    try {
      const parsedProducts = parseProductJson(input);
      if (!parsedProducts) {
        throw new Error('Invalid JSON format');
      }

      // Check each product against our database
      const matched: typeof parsedProducts = [];
      const unmatched: UnmatchedProduct[] = [];

      parsedProducts.forEach(p => {
        // Try to find exact match first
        const existingProduct = products.find(
          ep => ep.name.toLowerCase() === p.name.toLowerCase()
        );

        if (existingProduct) {
          matched.push({
            name: existingProduct.name,
            quantity: p.quantity,
            totalPrice: p.totalPrice,
            matched: true
          });
        } else {
          unmatched.push({
            name: p.name,
            quantity: p.quantity,
            totalPrice: p.totalPrice,
            matched: false
          });
        }
      });

      // Update transaction with matched products
      setNewTransactions(prev => prev.map(t => {
        if (t.id === transactionId) {
          const products = matched.map(p => ({
            name: p.name,
            quantity: p.quantity,
            unitPrice: p.totalPrice / p.quantity,
            totalPrice: p.totalPrice
          }));

          return {
            ...t,
            products: products
          };
        }
        return t;
      }));

      // Store unmatched products
      if (unmatched.length > 0) {
        setUnmatchedProducts(prev => ({
          ...prev,
          [transactionId]: unmatched
        }));
      }

      // Clear JSON input after successful parse
      setJsonInput(prev => ({ ...prev, [transactionId]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse JSON');
    }
  };

  // Add function to handle global JSON matching
  const handleGlobalJsonMatch = () => {
    try {
      const parsedProducts = parseProductJson(globalJsonInput);
      if (!parsedProducts) {
        throw new Error('Invalid JSON format');
      }

      // Calculate total spend from JSON
      const totalSpend = parsedProducts.reduce((sum, p) => sum + p.totalPrice, 0);

      // Find a matching transaction
      const matchingTransaction = newTransactions.find(t => 
        Math.abs(t.amount - totalSpend) < 0.01 && // Match within a penny
        (!t.products || t.products.length === 0) // Only match transactions without products
      );

      if (!matchingTransaction) {
        throw new Error(`No matching transaction found for total $${totalSpend.toFixed(2)}`);
      }

      // Handle the JSON input for the matching transaction
      handleJsonInput(matchingTransaction.id, globalJsonInput);
      
      // Clear the global input
      setGlobalJsonInput('');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to match JSON to transaction');
    }
  };

  // Add section to render unmatched products with search functionality
  const renderUnmatchedProducts = (transactionId: string) => {
    const unmatched = unmatchedProducts[transactionId];
    if (!unmatched?.length) return null;

    return (
      <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
        <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
          Unmatched Products
        </h4>
        <div className="space-y-3">
          {unmatched.map((product, idx) => {
            const searchKey = `${transactionId}-${idx}`;
            const searchQuery = productSearchQueries[searchKey] || product.name;
            const isSearching = activeSearchProduct === searchKey;
            
            const searchResults = isSearching ? 
              products.filter(p => 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.sku.toLowerCase().includes(searchQuery.toLowerCase())
              ) : [];

            return (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setProductSearchQueries(prev => ({
                        ...prev,
                        [searchKey]: e.target.value
                      }));
                      setActiveSearchProduct(searchKey);
                    }}
                    onFocus={() => {
                      setActiveSearchProduct(searchKey);
                    }}
                    onBlur={() => {
                      setTimeout(() => setActiveSearchProduct(null), 200);
                    }}
                    className="w-full text-sm rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                  />
                  {isSearching && searchResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700">
                      <div className="max-h-96 overflow-y-auto">
                        {searchResults.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              handleAddProduct(transactionId, {
                                ...p,
                                lastPurchasePrice: product.totalPrice / product.quantity
                              }, product.quantity);
                              
                              const newUnmatched = unmatched.filter((_, i) => i !== idx);
                              setUnmatchedProducts(prev => ({
                                ...prev,
                                [transactionId]: newUnmatched
                              }));
                              setActiveSearchProduct(null);
                              setProductSearchQueries(prev => ({
                                ...prev,
                                [searchKey]: ''
                              }));
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <div className="text-sm font-medium">{p.name}</div>
                            <div className="text-xs text-gray-500">
                              SKU: {p.sku} - Original spend: ${(product.totalPrice / product.quantity).toFixed(2)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-600 whitespace-nowrap">
                  {product.quantity}x = ${product.totalPrice.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Add this function to handle supplier order number changes
  const handleSetSupplierOrderNumber = (transactionId: string, supplierOrderNumber: string) => {
    setNewTransactions(prev => prev.map(t => {
      if (t.id === transactionId) {
        return {
          ...t,
          supplierOrderNumber
        }
      }
      return t
    }))
  }

  // Add function to handle editing saved transactions
  const handleUpdateSavedTransaction = async (transaction: EmailTransaction) => {
    try {
      setSaving(prev => ({ ...prev, [transaction.id]: true }))
      
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update transaction');
      }

      // Refresh saved transactions
      await fetchSavedTransactions();
      setEditingSavedTransaction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update transaction');
    } finally {
      setSaving(prev => ({ ...prev, [transaction.id]: false }))
    }
  }

  // Modify the product re-selection handler for saved transactions
  const handleSavedProductReselect = (transaction: EmailTransaction, productIndex: number) => {
    setEditingSavedProductId(`${transaction.id}-${productIndex}`);
    setSearchQuery(transaction.products?.[productIndex]?.name || '');
    setShowSuggestions(true);
  }

  // Add handler for adding new products to saved transactions
  const handleAddProductToSaved = (transaction: EmailTransaction, product: Product) => {
    const newProduct = {
      productId: product.id,
      name: product.name,
      quantity: quantity,
      unitPrice: product.lastPurchasePrice,
      totalPrice: product.lastPurchasePrice * quantity
    };

    const updatedTransaction = {
      ...transaction,
      products: [...(transaction.products || []), newProduct]
    };

    setSavedTransactions(prev => 
      prev.map(t => t.id === transaction.id ? updatedTransaction : t)
    );
    
    setSearchQuery('');
    setShowSuggestions(false);
    setQuantity(1);
  }

  // Add this function to handle product re-selection
  const handleProductReselect = (transactionId: string, productIndex: number, currentProduct: any) => {
    setEditingSavedProductId(`${transaction.id}-${productIndex}`);
    setSearchQuery(currentProduct.name);
    setShowSuggestions(true);
  }

  // Add this new function to handle product updates
  const handleUpdateProduct = (transactionId: string, productIndex: number, newProduct: Product) => {
    setNewTransactions(prev => prev.map(t => {
      if (t.id === transactionId && t.products) {
        const updatedProducts = [...t.products];
        const currentProduct = updatedProducts[productIndex];
        updatedProducts[productIndex] = {
          productId: newProduct.id,
          name: newProduct.name,
          quantity: currentProduct.quantity,
          unitPrice: currentProduct.unitPrice,
          totalPrice: currentProduct.unitPrice * currentProduct.quantity
        };
        return {
          ...t,
          products: updatedProducts
        };
      }
      return t;
    }));
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            American Express Purchases
          </h2>
          {error && (
            <p className="text-sm text-red-600 mt-1">{error}</p>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync Emails'}
        </button>
      </div>

      {/* New Transactions */}
      {newTransactions.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            New Transactions
          </h3>

          {/* Add Global JSON Input */}
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Match JSON to Transaction
            </label>
            <div className="flex gap-2">
              <textarea
                value={globalJsonInput}
                onChange={(e) => setGlobalJsonInput(e.target.value)}
                placeholder="Paste JSON here to match with a transaction..."
                className="flex-1 text-xs rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700 font-mono"
                rows={3}
              />
              <button
                type="button"
                onClick={handleGlobalJsonMatch}
                disabled={!globalJsonInput}
                className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 h-fit"
              >
                Match
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {newTransactions.map((transaction) => (
              <div key={transaction.id} className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {new Date(transaction.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          timeZone: 'America/New_York'
                        })}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      ${transaction.amount.toFixed(2)}
                    </span>
                    {transaction.products?.length > 0 && (
                      <div className="text-xs mt-1">
                        <span className="text-gray-600 dark:text-gray-400">
                          Products Total: ${calculateProductsTotal(transaction.products).toFixed(2)}
                        </span>
                        {calculateDifference(transaction) !== 0 && (
                          <span className={`ml-2 ${
                            calculateDifference(transaction) > 0 
                              ? 'text-red-600 dark:text-red-400' 
                              : 'text-orange-600 dark:text-orange-400'
                          }`}>
                            ({calculateDifference(transaction) > 0 ? '+' : ''}
                            ${calculateDifference(transaction).toFixed(2)} difference)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDelete(transaction.id)}
                      disabled={deleting[transaction.id]}
                      className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                    >
                      {deleting[transaction.id] ? 'Deleting...' : 'Delete'}
                    </button>
                    <button
                      onClick={() => handleSaveTransaction(transaction)}
                      disabled={saving[transaction.id] || !transaction.supplier || !(transaction.products?.length)}
                      className="text-xs text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                    >
                      {saving[transaction.id] ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Supplier Input */}
                <div className="mb-3">
                  <input
                    type="text"
                    placeholder="Enter supplier name"
                    value={transaction.supplier || ''}
                    onChange={(e) => handleSetSupplier(transaction.id, e.target.value)}
                    className="w-full text-sm rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>

                {/* Add this new input for supplier order number */}
                <div className="mb-3">
                  <input
                    type="text"
                    placeholder="Enter supplier order number"
                    value={transaction.supplierOrderNumber || ''}
                    onChange={(e) => handleSetSupplierOrderNumber(transaction.id, e.target.value)}
                    className="w-full text-sm rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>

                {/* Products List */}
                {transaction.products?.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {transaction.products.map((product, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            value={product.quantity}
                            onChange={(e) => handleUpdateProductQuantity(transaction.id, idx, parseInt(e.target.value) || 1)}
                            className="w-16 text-xs rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                          />
                          {editingSavedProductId === `${transaction.id}-${idx}` ? (
                            <div className="relative flex-1">
                              <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                  setSearchQuery(e.target.value);
                                  setShowSuggestions(true);
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                className="w-full text-xs rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                              />
                              {showSuggestions && (
                                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700">
                                  <div className="max-h-60 overflow-y-auto">
                                    {filteredProducts.map(p => (
                                      <button
                                        key={p.id}
                                        onClick={() => {
                                          handleUpdateProduct(transaction.id, idx, p);
                                          setEditingSavedProductId(null);
                                          setSearchQuery('');
                                          setShowSuggestions(false);
                                        }}
                                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                                      >
                                        <div className="text-sm font-medium">{p.name}</div>
                                        <div className="text-xs text-gray-500">
                                          SKU: {p.sku} - ${p.lastPurchasePrice.toFixed(2)}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => handleProductReselect(transaction.id, idx, product)}
                              className="text-left hover:text-blue-600"
                            >
                              {product.name}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span>$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={product.unitPrice}
                            onChange={(e) => handleUpdateProductPrice(transaction.id, idx, parseFloat(e.target.value) || 0)}
                            className="w-20 text-xs rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                          />
                          <span>= ${product.totalPrice.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add JSON Input Section */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Paste JSON Products
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      value={jsonInput[transaction.id] || ''}
                      onChange={(e) => setJsonInput(prev => ({ 
                        ...prev, 
                        [transaction.id]: e.target.value 
                      }))}
                      placeholder="Paste JSON here..."
                      className="flex-1 text-xs rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700 font-mono"
                      rows={3}
                    />
                    <button
                      type="button"
                      onClick={() => handleJsonInput(transaction.id, jsonInput[transaction.id] || '')}
                      className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Parse
                    </button>
                  </div>
                </div>

                {/* Add Unmatched Products Section */}
                {renderUnmatchedProducts(transaction.id)}

                {/* Add Product - Autocomplete */}
                {editingTransaction === transaction.id && (
                  <div className="space-y-2">
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
                          className="w-full text-sm rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                        />
                        {/* Product Suggestions Dropdown */}
                        {showSuggestions && searchQuery && (
                          <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-auto">
                            {filteredProducts.length > 0 ? (
                              filteredProducts.map(product => (
                                <button
                                  key={product.id}
                                  type="button"
                                  onClick={() => handleProductSelect(transaction.id, product)}
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
                        onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                        className="w-20 text-sm rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setEditingTransaction(null)
                        setSearchQuery('')
                        setShowSuggestions(false)
                        setQuantity(1)
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      Done Adding Products
                    </button>
                  </div>
                )}

                {editingTransaction !== transaction.id && (
                  <button
                    onClick={() => setEditingTransaction(transaction.id)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Add Products
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Transactions */}
      <div className="space-y-2">
        {savedTransactions.length > 0 && (
          <div className="flex items-center mb-4">
            <label className="flex items-center text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={selectedIds.size === savedTransactions.length}
                onChange={handleSelectAll}
                className="rounded border-gray-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50 mr-2"
              />
              Select All
            </label>
          </div>
        )}
        {savedTransactions.map((transaction) => (
          <div key={transaction.id} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
            {editingSavedTransaction === transaction.id ? (
              <div className="w-full space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter supplier name"
                    value={transaction.supplier || ''}
                    onChange={(e) => {
                      const updatedTransaction = { ...transaction, supplier: e.target.value };
                      setSavedTransactions(prev => 
                        prev.map(t => t.id === transaction.id ? updatedTransaction : t)
                      );
                    }}
                    className="flex-1 text-sm rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                  />
                  <input
                    type="text"
                    placeholder="Enter supplier order number"
                    value={transaction.supplierOrderNumber || ''}
                    onChange={(e) => {
                      const updatedTransaction = { ...transaction, supplierOrderNumber: e.target.value };
                      setSavedTransactions(prev => 
                        prev.map(t => t.id === transaction.id ? updatedTransaction : t)
                      );
                    }}
                    className="flex-1 text-sm rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>

                {/* Products editing section */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Products</h4>
                  {transaction.products?.map((product, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={product.quantity}
                        onChange={(e) => {
                          const newQuantity = parseInt(e.target.value) || 1;
                          const updatedProducts = [...(transaction.products || [])];
                          updatedProducts[idx] = {
                            ...product,
                            quantity: newQuantity,
                            totalPrice: product.unitPrice * newQuantity
                          };
                          const updatedTransaction = { ...transaction, products: updatedProducts };
                          setSavedTransactions(prev => 
                            prev.map(t => t.id === transaction.id ? updatedTransaction : t)
                          );
                        }}
                        className="w-20 text-sm rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                      />
                      {editingSavedProductId === `${transaction.id}-${idx}` ? (
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                              setSearchQuery(e.target.value);
                              setShowSuggestions(true);
                            }}
                            className="w-full text-sm rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                            placeholder="Search for a product..."
                          />
                          {showSuggestions && (
                            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700">
                              <div className="max-h-60 overflow-y-auto">
                                {filteredProducts.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => {
                                      const updatedProducts = [...(transaction.products || [])];
                                      updatedProducts[idx] = {
                                        productId: p.id,
                                        name: p.name,
                                        quantity: product.quantity,
                                        unitPrice: product.unitPrice,
                                        totalPrice: product.unitPrice * product.quantity
                                      };
                                      const updatedTransaction = { ...transaction, products: updatedProducts };
                                      setSavedTransactions(prev => 
                                        prev.map(t => t.id === transaction.id ? updatedTransaction : t)
                                      );
                                      setEditingSavedProductId(null);
                                      setSearchQuery('');
                                      setShowSuggestions(false);
                                    }}
                                    className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    <div className="text-sm font-medium">{p.name}</div>
                                    <div className="text-xs text-gray-500">
                                      SKU: {p.sku} - ${p.lastPurchasePrice.toFixed(2)}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSavedProductReselect(transaction, idx)}
                          className="text-sm hover:text-blue-600"
                        >
                          {product.name}
                        </button>
                      )}
                      <div className="flex items-center gap-1">
                        <span>$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={product.unitPrice}
                          onChange={(e) => {
                            const newUnitPrice = parseFloat(e.target.value) || 0;
                            const updatedProducts = [...(transaction.products || [])];
                            updatedProducts[idx] = {
                              ...product,
                              unitPrice: newUnitPrice,
                              totalPrice: newUnitPrice * product.quantity
                            };
                            const updatedTransaction = { ...transaction, products: updatedProducts };
                            setSavedTransactions(prev => 
                              prev.map(t => t.id === transaction.id ? updatedTransaction : t)
                            );
                          }}
                          className="w-24 text-sm rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                        />
                      </div>
                      <span className="text-sm">= ${product.totalPrice.toFixed(2)}</span>
                      <button
                        onClick={() => {
                          const updatedProducts = (transaction.products || []).filter((_, i) => i !== idx);
                          const updatedTransaction = { ...transaction, products: updatedProducts };
                          setSavedTransactions(prev => 
                            prev.map(t => t.id === transaction.id ? updatedTransaction : t)
                          );
                        }}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  
                  {/* Add new product section */}
                  <div className="mt-4">
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setShowSuggestions(true);
                          }}
                          placeholder="Search for a product to add..."
                          className="w-full text-sm rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                        />
                        {showSuggestions && searchQuery && (
                          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700">
                            <div className="max-h-60 overflow-y-auto">
                              {filteredProducts.map(product => (
                                <button
                                  key={product.id}
                                  onClick={() => handleAddProductToSaved(transaction, product)}
                                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <div className="text-sm font-medium">{product.name}</div>
                                  <div className="text-xs text-gray-500">
                                    SKU: {product.sku} - ${product.lastPurchasePrice.toFixed(2)}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                        className="w-20 text-sm rounded-md border-gray-300 dark:bg-gray-800 dark:border-gray-700"
                        placeholder="Qty"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div className="text-sm">
                    <span className="font-medium">Total Amount: </span>
                    <span>${transaction.amount.toFixed(2)}</span>
                    {transaction.products && (
                      <>
                        <span className="ml-2 font-medium">Products Total: </span>
                        <span>${calculateProductsTotal(transaction.products).toFixed(2)}</span>
                        {calculateDifference(transaction) !== 0 && (
                          <span className={`ml-2 ${
                            calculateDifference(transaction) > 0 
                              ? 'text-red-600' 
                              : 'text-orange-600'
                          }`}>
                            ({calculateDifference(transaction) > 0 ? '+' : ''}
                            ${calculateDifference(transaction).toFixed(2)} difference)
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingSavedTransaction(null)}
                      className="text-xs text-gray-600 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdateSavedTransaction(transaction)}
                      disabled={saving[transaction.id]}
                      className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                    >
                      {saving[transaction.id] ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-grow">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(transaction.id)}
                      onChange={() => handleCheckboxChange(transaction.id)}
                      className="rounded border-gray-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          ${transaction.amount.toFixed(2)}
                        </span>
                        {transaction.supplier && (
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            from {transaction.supplier}
                          </span>
                        )}
                        {transaction.supplierOrderNumber && (
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            (Order #: {transaction.supplierOrderNumber})
                          </span>
                        )}
                      </div>
                      {transaction.products && transaction.products.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {transaction.products.map((product, idx) => (
                            <div key={idx} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                              <span>{product.quantity}x</span>
                              <span>{product.name}</span>
                              <span className="text-gray-500">
                                (${product.totalPrice.toFixed(2)})
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(transaction.id)}
                    disabled={deleting[transaction.id]}
                    className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                  >
                    {deleting[transaction.id] ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setEditingSavedTransaction(transaction.id)}
                    className="text-xs text-blue-600 hover:text-blue-700 ml-2"
                  >
                    Edit
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Delete Button */}
      {selectedIds.size > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : `Delete (${selectedIds.size})`}
          </button>
        </div>
      )}
    </Card>
  )
} 