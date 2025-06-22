'use client'

import { useState, useEffect, useRef } from 'react'
import { Product } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

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
  category: string
  supplier: string
  supplierOrderNumber: string
  products: LineItem[]
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

// Define the shape of the data SENT to the API
// Note the differences for the 'expense' type compared to ExpenseFormData
type BasePayload = Omit<BaseTransactionFormData, 'notes'> & { date: string; notes?: string }; // Ensure date is string (ISO)

type SalePayload = Omit<SaleFormData, 'date'> & BasePayload & { type: 'sale' };

type ExpensePayload = Omit<ExpenseFormData, 'date' | 'category' | 'supplier'> & BasePayload & {
  type: 'expense';
  purchaseCategory: string; // Renamed from category
  merchant: string;         // Renamed from supplier
  products: LineItem[];     // Add products field
};

type TrainingPayload = Omit<TrainingFormData, 'date'> & BasePayload & { type: 'training' };

type TransactionPayload = SalePayload | ExpensePayload | TrainingPayload;

type NewSaleModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

function NewSaleModalDesktop({ open, onOpenChange, onSuccess }: NewSaleModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [popularProducts, setPopularProducts] = useState<Product[]>([])
  const isDesktop = useIsDesktop();
  const selectedProductsRef = useRef<HTMLDivElement | null>(null);
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
  const [showOtherCategoryInput, setShowOtherCategoryInput] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [newProductFormData, setNewProductFormData] = useState<Partial<Product>>({});
  const [isIngredientChecked, setIsIngredientChecked] = useState(false);

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
      } as SaleFormData)
      // Also reset create product state if modal reopens
      setIsCreatingProduct(false);
      setNewProductFormData({});
      setIsIngredientChecked(false);
      setProductSearchTerm('');
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
        setPopularProducts(activeProducts.slice(0, 8))
      } catch (error) {
        console.error('Error fetching products:', error)
      }
    }
    
    fetchProducts()
  }, [])

  // Fetch recent transactions to compute popular products
  useEffect(() => {
    if (products.length === 0) return;

    const fetchRecent = async () => {
      try {
        const res = await fetch('/api/transactions?limit=100&type=sale');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.transactions) return;

        const counts: Record<string, number> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.transactions.forEach((tx: any) => {
          if (Array.isArray(tx.products)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tx.products.forEach((p: any) => {
              if (p.productId) {
                counts[p.productId] = (counts[p.productId] || 0) + p.quantity;
              }
            });
          }
        });

        const sortedIds = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([id]) => id);

        const popular = products.filter(p => p._id && sortedIds.includes(p._id));
        // if less than 8, fallback fill from products list
        const filled = popular.concat(products.filter(p => !popular.includes(p)).slice(0, 8 - popular.length));
        setPopularProducts(filled);
      } catch (err) {
        console.error('Failed to fetch recent transactions', err);
      }
    };

    fetchRecent();
  }, [products]);

  // Calculate totals whenever products change or amount/shipping is manually updated for sales
  useEffect(() => {
    const TAX_RATE = 0.08875; // Define tax rate locally

    if (formData.type === 'sale') {
      const saleData = formData as SaleFormData;

      // 1. Calculate total TAX-INCLUSIVE sum from products
      // User confirms product.price and therefore item.totalPrice are tax-inclusive.
      const itemsTotalInclTax = saleData.products.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

      // 2. Calculate pre-tax and tax amounts for items from their tax-inclusive total
      let itemsPreTaxSubtotal;
      let itemsTax;

      if (saleData.isTaxable && (1 + TAX_RATE) !== 0) { // Ensure (1 + TAX_RATE) is not zero to avoid division by zero
        itemsPreTaxSubtotal = itemsTotalInclTax / (1 + TAX_RATE);
        // Calculate tax as the difference to ensure sum matches itemsTotalInclTax before further rounding
        itemsTax = itemsTotalInclTax - itemsPreTaxSubtotal;
      } else { // Not taxable or problematic TAX_RATE (e.g., if TAX_RATE was -1)
        itemsPreTaxSubtotal = itemsTotalInclTax; // If not taxable, the entire amount is pre-tax
        itemsTax = 0;
      }

      // 3. Shipping amounts (Shipping is typically pre-tax, and tax is added on top)
      const shippingPreTax = saleData.shipping || 0; // Default to 0
      const shippingTax = saleData.isTaxable ? shippingPreTax * TAX_RATE : 0;

      // 4. Natural (calculated) pre-tax, tax, and total (before tip/discount)
      const naturalDisplayPreTaxAmount = itemsPreTaxSubtotal + shippingPreTax;
      const naturalDisplayTaxAmount = itemsTax + shippingTax;
      const naturalCalculatedTotal = naturalDisplayPreTaxAmount + naturalDisplayTaxAmount;

      // 5. Determine the actual overall total to use.
      // If saleData.amount is explicitly set by the user (not 0 and different from naturalCalculatedTotal), it's an override.
      const isManuallyOverridden = saleData.amount !== 0 && Math.abs(saleData.amount - naturalCalculatedTotal) > 0.001;
      const actualOverallTotal = isManuallyOverridden ? saleData.amount : naturalCalculatedTotal;

      let finalTip = 0;
      let finalDiscount = 0;
      let finalDisplayPreTaxAmount = naturalDisplayPreTaxAmount; // Default to natural values
      let finalDisplayTaxAmount = naturalDisplayTaxAmount;   // Default to natural values

      if (isManuallyOverridden) {
        if (actualOverallTotal > naturalCalculatedTotal) { // Tip scenario
          finalTip = actualOverallTotal - naturalCalculatedTotal;
          // Pre-tax and tax amounts remain based on original items and shipping
          finalDisplayPreTaxAmount = naturalDisplayPreTaxAmount;
          finalDisplayTaxAmount = naturalDisplayTaxAmount;
        } else if (actualOverallTotal < naturalCalculatedTotal) { // Discount scenario
          finalDiscount = naturalCalculatedTotal - actualOverallTotal;
          // Recalculate pre-tax and tax based on the new actualOverallTotal
          if (saleData.isTaxable && (1 + TAX_RATE) !== 0) {
            finalDisplayPreTaxAmount = actualOverallTotal / (1 + TAX_RATE);
            finalDisplayTaxAmount = finalDisplayPreTaxAmount * TAX_RATE;
          } else if (!saleData.isTaxable) { // No tax, discount applies directly to pre-tax
            finalDisplayPreTaxAmount = actualOverallTotal;
            finalDisplayTaxAmount = 0;
          } else { 
            // Fallback for taxable but (1+TAX_RATE) is zero or invalid state (highly unlikely)
            // Keep natural amounts or handle as an error state if necessary
            finalDisplayPreTaxAmount = naturalDisplayPreTaxAmount;
            finalDisplayTaxAmount = naturalDisplayTaxAmount;
          }
        }
        // If actualOverallTotal === naturalCalculatedTotal but isManuallyOverridden is true
        // (e.g., user typed the exact calculated amount), tip/discount remain 0,
        // and pre-tax/tax amounts are the natural ones, which is already handled by defaults.
      }

      setFormData(prev => {
        // Ensure prev is SaleFormData before spreading and updating
        if (prev.type !== 'sale') return prev;
        const currentSaleData = prev as SaleFormData;

        return {
          ...currentSaleData,
          preTaxAmount: parseFloat(finalDisplayPreTaxAmount.toFixed(2)),
          taxAmount: parseFloat(finalDisplayTaxAmount.toFixed(2)),
          tip: parseFloat(finalTip.toFixed(2)),
          discount: parseFloat(finalDiscount.toFixed(2)),
          amount: parseFloat(actualOverallTotal.toFixed(2)),
        };
      });

    } else if (formData.type === 'expense') {
      // --- Expense Calculation ---
      const expenseData = formData as ExpenseFormData;
      const productsTotal = expenseData.products.reduce((sum, item) => sum + item.totalPrice, 0);

      // For expenses, the amount is simply the sum of product totals
      setFormData(prev => ({
        ...(prev as ExpenseFormData), // Cast to ExpenseFormData
        amount: parseFloat(productsTotal.toFixed(2)),
      }));
    }
    // Dependencies: Watch products array, shipping (for sales), amount (manual override for sales), and type
  }, [formData.type, 
      // Only depend on products if type is sale or expense
      (formData.type === 'sale' || formData.type === 'expense') ? formData.products : null, 
      formData.type === 'sale' ? formData.shipping : null, 
      formData.type === 'sale' ? formData.amount : null, 
      formData.type === 'sale' ? formData.isTaxable : null]);

  // Fetch customer suggestions when typing
  useEffect(() => {
    async function fetchCustomers() {
      if (formData.type === 'sale' && (formData as SaleFormData).customer.length < 2) {
        setCustomerSuggestions([]);
        return;
      }
      
      try {
        const response = await fetch(`/api/customers/search?query=${encodeURIComponent(((formData as SaleFormData).customer) || '')}`)
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

      // Prepare payload, mapping fields for expense type
      let payload: TransactionPayload;

      if (formData.type === 'expense') {
        const { category, supplier, ...restExpenseData } = formData;
        payload = {
          ...restExpenseData,
          date: date.toISOString(),
          purchaseCategory: category,
          merchant: supplier,
        };
      } else {
        // For sale or training, the structure matches TransactionPayload directly
        payload = {
          ...formData,
          date: date.toISOString(),
        };
      }

      console.log('Client: handleSubmit: payload before API call:', payload);
      console.log('Client: handleSubmit: preTaxAmount:', formData.type === 'sale' ? ((formData as SaleFormData).preTaxAmount).toFixed(2) : 'N/A');
      console.log('Client: handleSubmit: taxAmount:', formData.type === 'sale' ? ((formData as SaleFormData).taxAmount).toFixed(2) : 'N/A');

      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      console.log('Client: handleSubmit: API Response Status:', response.status);
      const responseData = await response.json();
      console.log('Client: handleSubmit: API Response Data:', responseData);

      if (!response.ok) {
         const errorText = await response.text();
         console.error("API Error:", errorText);
        throw new Error(`Failed to create transaction: ${response.status} ${errorText.substring(0, 100)}`)
      }

      // --- Update lastPurchasePrice for expense products --- 
      if (payload.type === 'expense' && payload.products && payload.products.length > 0) {
        console.log('Updating last purchase prices for expense products...');
        const updatePromises = payload.products.map(item => {
          if (!item.productId) {
            console.warn('Skipping price update for item without productId:', item.name);
            return Promise.resolve(); // Skip if no productId
          }
          return fetch(`/api/products/${item.productId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ lastPurchasePrice: item.unitPrice })
          })
          .then(updateResponse => {
            if (!updateResponse.ok) {
              console.error(`Failed to update lastPurchasePrice for product ${item.productId} (${item.name}): ${updateResponse.status}`);
              // Decide if you want to throw an error here or just log it
            }
          })
          .catch(updateError => {
             console.error(`Error updating lastPurchasePrice for product ${item.productId} (${item.name}):`, updateError);
             // Decide if you want to throw an error here or just log it
          });
        });

        // Wait for all updates to attempt (optional, depending on desired UX)
        try {
          await Promise.all(updatePromises);
           console.log('Finished attempting price updates.');
        } catch (error) {
          // This catch block might be redundant if individual promises don't throw
          console.error('An error occurred during one or more price updates.', error);
        }
      }
      // --- End of price update logic ---

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
          category: '',
          supplier: '',
          supplierOrderNumber: '',
          products: [],
        } as ExpenseFormData)
        setShowOtherCategoryInput(false);
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
    // Determine unit price based on transaction type
    const unitPrice = formData.type === 'sale'
      ? product.price
      : (product.lastPurchasePrice || 0); // Use lastPurchasePrice for expenses, default 0

    setFormData(prev => {
      if (prev.type !== 'sale' && prev.type !== 'expense') return prev;

      // Check if product already exists
      const existingIdx = prev.products?.findIndex(item => item.productId === product._id);

      let updatedProducts: LineItem[] = [];

      if (existingIdx !== undefined && existingIdx !== -1 && prev.products) {
        // Increment quantity
        updatedProducts = [...prev.products];
        const existing = updatedProducts[existingIdx];
        const newQty = existing.quantity + 1;
        updatedProducts[existingIdx] = {
          ...existing,
          quantity: newQty,
          totalPrice: parseFloat((existing.unitPrice * newQty).toFixed(2))
        };
      } else {
        // Add as new product line
        const newProduct: LineItem = {
          productId: product._id,
          name: product.name,
          quantity: 1,
          unitPrice,
          totalPrice: unitPrice,
          isTaxable: prev.type === 'sale' ? (prev as SaleFormData).isTaxable : false
        };
        updatedProducts = [...(prev.products || []), newProduct];
      }

      return {
        ...prev,
        products: updatedProducts,
        amount: 0,
        ...(prev.type === 'sale' && { tip: 0, discount: 0 }),
      };
    });

    // Scroll selected products list to bottom to reveal newest entry
    setTimeout(() => {
      if (selectedProductsRef.current) {
        selectedProductsRef.current.scrollTo({ top: selectedProductsRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 0);
  }

  const handleUpdateProductQuantity = (index: number, quantity: number) => {
    // Allow updating quantity for both Sale and Expense types
     if (formData.type !== 'sale' && formData.type !== 'expense') return;

    // Use parseFloat and ensure quantity is not negative
    const validQuantity = Math.max(0, quantity || 0);

    setFormData(prev => {
      // Ensure type is correct before accessing products
      if (prev.type !== 'sale' && prev.type !== 'expense') return prev;
      // Ensure products array exists before trying to update
      if (!prev.products || index < 0 || index >= prev.products.length) {
         console.error("Product array is invalid or index out of bounds");
         return prev; // Return previous state if products array is invalid
       }

      const products = [...prev.products];
      products[index] = {
        ...products[index],
        quantity: validQuantity, // Use the validated quantity
        totalPrice: products[index].unitPrice * validQuantity // Use validated quantity for calculation
      }
      return {
        ...prev,
        products,
        // Reset amount to trigger recalculation based on products
        amount: 0,
         // Reset tip/discount only for sales
        ...(prev.type === 'sale' && { tip: 0, discount: 0 }),
      }
    })
  }

  const handleRemoveProduct = (index: number) => {
     // Allow removing products for both Sale and Expense types
     if (formData.type !== 'sale' && formData.type !== 'expense') return;

    setFormData(prev => {
       // Ensure type is correct before accessing products
       if (prev.type !== 'sale' && prev.type !== 'expense') return prev;
       // Ensure products array exists before trying to filter
       if (!prev.products || index < 0 || index >= prev.products.length) {
         console.error("Product array is invalid or index out of bounds");
         return prev; // Return previous state if products array is invalid
       }
       // Add explicit types to filter parameters
       const updatedProducts = prev.products.filter((_: LineItem, i: number) => i !== index);
      return {
        ...prev,
        products: updatedProducts,
        // Reset amount to trigger recalculation based on products
        amount: 0,
         // Reset tip/discount only for sales
        ...(prev.type === 'sale' && { tip: 0, discount: 0 }),
      }
    });
  }

  const handleUpdateProductUnitPrice = (index: number, unitPrice: number) => {
    // Allow updating for sale or expense
    if (formData.type !== 'expense' && formData.type !== 'sale') return;

    const validUnitPrice = Math.max(0, unitPrice || 0); // Ensure non-negative

    setFormData(prev => {
      if (prev.type !== 'expense' && prev.type !== 'sale') return prev;
      if (!prev.products || index < 0 || index >= prev.products.length) return prev;

      const products = [...prev.products];
      const productToUpdate = products[index];

      products[index] = {
        ...productToUpdate,
        unitPrice: validUnitPrice,
        totalPrice: validUnitPrice * productToUpdate.quantity // Recalculate total price
      };

      return {
        ...prev,
        products,
        amount: 0 // Reset amount to trigger recalculation
      };
    });
  };

  const handleUpdateProductTotalPrice = (index: number, totalPrice: number) => {
    // Allow updating for sale or expense
    if (formData.type !== 'expense' && formData.type !== 'sale') return;

    const validTotalPrice = Math.max(0, totalPrice || 0); // Ensure non-negative

    setFormData(prev => {
      if (prev.type !== 'expense' && prev.type !== 'sale') return prev;
      if (!prev.products || index < 0 || index >= prev.products.length) return prev;

      const products = [...prev.products];
      const productToUpdate = products[index];

      // Recalculate unit price, handle quantity being 0 or invalid
      const quantity = productToUpdate.quantity > 0 ? productToUpdate.quantity : 1; // Avoid division by zero
      const newUnitPrice = validTotalPrice / quantity;

      products[index] = {
        ...productToUpdate,
        unitPrice: parseFloat(newUnitPrice.toFixed(2)), // Round unit price
        totalPrice: validTotalPrice
      };

      return {
        ...prev,
        products,
        amount: 0 // Reset amount to trigger recalculation
      };
    });
  };

  // Handler to save the new product created via the sub-form
  const handleSaveNewProduct = async () => { 
    if (!newProductFormData || !newProductFormData.name) {
      alert("Product name is required."); // Replace with better validation/toast
      return;
    }

    // Add more validation as needed for SKU, category, price etc.
    if (!newProductFormData.sku) {
      alert("SKU is required.");
      return;
    }
    if (typeof newProductFormData.lastPurchasePrice !== 'number') { // Validate Cost (lastPurchasePrice)
      alert("Cost must be a valid number.");
      return;
    }
    // Validate Retail Price only if it's not an ingredient (using separate state)
    if (!isIngredientChecked && typeof newProductFormData.price !== 'number') { 
      alert("Retail Price must be a valid number.");
      return;
    }
    
    const finalProductData: Omit<Product, '_id' | 'id'> = {
      // Use Omit to represent data before saving
      // Re-apply defaults for fields not in the mini-form, merging with form data
      name: newProductFormData.name, // From form state
      sku: newProductFormData.sku,     // From form state
      // Set category based on isIngredientChecked state
      category: isIngredientChecked ? 'Ingredient' : (newProductFormData.category || 'Uncategorized'), // Use separate state 
      // Set price based on isIngredientChecked state
      price: isIngredientChecked ? 0 : (newProductFormData.price || 0), // Use separate state
      lastPurchasePrice: newProductFormData.lastPurchasePrice, // From form state (Cost field)
      baseProductName: newProductFormData.baseProductName || newProductFormData.name, 
      variantName: newProductFormData.variantName || 'Default', 
      description: newProductFormData.description || '',
      barcode: newProductFormData.barcode || '',
      minimumStock: typeof newProductFormData.minimumStock === 'number' ? newProductFormData.minimumStock : 0,
      averageCost: typeof newProductFormData.averageCost === 'number' ? newProductFormData.averageCost : 0,
      supplier: newProductFormData.supplier || '',
      stock: typeof newProductFormData.stock === 'number' ? newProductFormData.stock : 0,
      active: typeof newProductFormData.active === 'boolean' ? newProductFormData.active : true,
      isProxied: typeof newProductFormData.isProxied === 'boolean' ? newProductFormData.isProxied : false,
      proxyOf: newProductFormData.proxyOf || undefined,
      proxyRatio: typeof newProductFormData.proxyRatio === 'number' ? newProductFormData.proxyRatio : undefined,
      costHistory: newProductFormData.costHistory || [],
      totalSpent: typeof newProductFormData.totalSpent === 'number' ? newProductFormData.totalSpent : 0,
      totalPurchased: typeof newProductFormData.totalPurchased === 'number' ? newProductFormData.totalPurchased : 0,
      lastRestockDate: newProductFormData.lastRestockDate || undefined,
      platformMetadata: newProductFormData.platformMetadata || [],
      syncStatus: newProductFormData.syncStatus || { lastSyncAttempt: '', lastSuccessfulSync: '', errors: [] },
      // createdAt and updatedAt are usually set by the backend/database
    };

    console.log("Attempting to save product:", finalProductData);

    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalProductData), // Send validated and combined data
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to create product (${response.status})`);
      }

      const createdProduct: Product = await response.json(); // API returns the new product with _id
      console.log("Product created successfully:", createdProduct);

      if (!createdProduct || !createdProduct._id) {
         throw new Error('Invalid product data received from API after creation.');
      }

      // Add the new product to the main products list state
      const updatedProductsList = [...products, createdProduct];
      setProducts(updatedProductsList);
      // Add the new product to the current transaction
      handleAddProduct(createdProduct); // This function adds it to formData.products
      
      // Reset states
      setProductSearchTerm('');
      setIsCreatingProduct(false);
      setNewProductFormData({}); // Clear the temporary form data
      setFilteredProducts(updatedProductsList); // Update filtered list immediately
      setIsIngredientChecked(false); // Reset checkbox state on success

      // alert(`Product '${createdProduct.name}' created and added.`); // Placeholder for toast

    } catch (error) {
      console.error("Error saving product:", error);
      alert(`Error: ${error instanceof Error ? error.message : 'Could not save product'}`); // Placeholder for toast
    }
  };

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

          {/* Common Fields (mobile-first layout) */}
          <div className="space-y-4">
            {/* Row: Amount + Sales Tax + Payment Methods */}
            <div className="flex flex-wrap items-start gap-4">
              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Amount</label>
                <div className="flex items-center mt-1">
                  <span className="text-gray-500 mr-1">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    readOnly={formData.type === 'expense' && 'products' in formData && (formData as ExpenseFormData).products.length > 0}
                    onChange={(e) => {
                      const newAmount = parseFloat(e.target.value) || 0;
                      if (formData.type === 'sale') {
                        setFormData(prev => ({ ...(prev as SaleFormData), amount: newAmount }));
                      } else if (formData.type === 'expense' && !(formData as ExpenseFormData).products.length) {
                        setFormData(prev => ({ ...(prev as ExpenseFormData), amount: newAmount }));
                      }
                    }}
                    onFocus={(e) => (e.target as HTMLInputElement).select()}
                    className={`block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${(formData.type === 'expense' && 'products' in formData && (formData as ExpenseFormData).products.length > 0) ? 'bg-gray-50' : ''}`}
                    style={{ width: `${String(formData.amount || 0).length + 3}ch` }}
                    required
                  />
                </div>
              </div>

              {/* Sales Tax (only for sale) */}
              {formData.type === 'sale' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Sales&nbsp;Tax</label>
                  <div className="flex items-center mt-1">
                    <span className="text-gray-500 mr-1">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      readOnly
                      value={(formData as SaleFormData).taxAmount.toFixed(2)}
                      className="rounded-md border-gray-300 bg-gray-50 shadow-sm"
                      style={{ width: `${String((formData as SaleFormData).taxAmount.toFixed(2)).length + 3}ch` }}
                    />
                  </div>
                </div>
              )}

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="mt-1 block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Payment Methods */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment&nbsp;Method</label>
                <div className="flex flex-wrap gap-2">
                  {['Venmo', 'Cash', 'Cash App', 'Zelle'].map((method) => (
                    <button
                      type="button"
                      key={method}
                      onClick={() => setFormData(prev => ({ ...prev, paymentMethod: method }))}
                      className={`px-3 py-1 rounded-full text-sm border transition-colors ${formData.paymentMethod === method ? 'bg-blue-500 text-white border-blue-500' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Apply Tax + Shipping/Tip/Discount (sale only) */}
            {formData.type === 'sale' && (
              <div className="flex flex-wrap items-end gap-4">
                {/* Apply-tax checkbox */}
                <label className="inline-flex items-center whitespace-nowrap text-sm font-medium text-gray-700 mr-2">
                  <input
                    type="checkbox"
                    checked={formData.isTaxable}
                    onChange={(e) => setFormData(prev => ({ ...prev, isTaxable: e.target.checked, amount: 0 }))}
                    className="mr-2 rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  Apply&nbsp;tax
                </label>

                {/* Shipping input */}
                <div>
                  <label className="block text-xs text-gray-500">Shipping</label>
                  <div className="flex items-center">
                    <span className="text-gray-500 mr-1">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={(formData as SaleFormData).shipping}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setFormData(prev => ({ ...(prev as SaleFormData), shipping: val, amount: 0 }));
                      }}
                      onFocus={(e) => (e.target as HTMLInputElement).select()}
                      className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      style={{ width: `${String((formData as SaleFormData).shipping || 0).length + 3}ch` }}
                    />
                  </div>
                </div>

                {/* Tip (read-only) */}
                <div>
                  <label className="block text-xs text-gray-500">Tip</label>
                  <div className="flex items-center">
                    <span className="text-gray-500 mr-1">$</span>
                    <Input
                      type="number"
                      readOnly
                      value={(formData as SaleFormData).tip.toFixed(2)}
                      className="rounded-md border-gray-300 bg-gray-50 shadow-sm"
                      style={{ width: `${((formData as SaleFormData).tip.toFixed(2)).length + 3}ch` }}
                    />
                  </div>
                </div>

                {/* Discount (read-only) */}
                <div>
                  <label className="block text-xs text-gray-500">Discount</label>
                  <div className="flex items-center">
                    <span className="text-gray-500 mr-1">$</span>
                    <Input
                      type="number"
                      readOnly
                      value={(formData as SaleFormData).discount.toFixed(2)}
                      className="rounded-md border-gray-300 bg-gray-50 shadow-sm"
                      style={{ width: `${((formData as SaleFormData).discount.toFixed(2)).length + 3}ch` }}
                    />
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Type-specific Fields */}
          {/* Sale Specific Section */}
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

              {/* Shipping, Tip, Discount */}
              {/* Shipping/Tip/Discount block removed (now displayed next to Apply Tax) */}
            </div>
          )}

          {/* Product Section (Visible for Sale and Expense) */}
          {(formData.type === 'sale' || formData.type === 'expense') && (
             <div className="space-y-4">
                <h3 className="text-md font-medium">
                  {formData.type === 'sale' ? 'Add Products to Sale' : 'Add Products Purchased'}
                </h3>
               {/* Quick-add popular products (mobile only) */}
               {!isDesktop && popularProducts.length > 0 && (
                 <div className="flex flex-wrap gap-2 mb-2">
                   {popularProducts.map((product) => (
                     <button
                       key={product._id}
                       type="button"
                       onClick={() => handleAddProduct(product)}
                       className="px-3 py-1 rounded-full bg-gray-100 text-sm hover:bg-blue-100 border border-gray-300"
                     >
                       {product.name}
                     </button>
                   ))}
                 </div>
               )}

               <div>
                 <input
                   type="text"
                   placeholder="Search products by name or SKU..."
                   value={productSearchTerm}
                   onChange={(e) => {
                     const searchTerm = e.target.value;
                     setProductSearchTerm(searchTerm);
                     const lowerSearchTerm = searchTerm.toLowerCase();
                     const filtered = products.filter(p =>
                       p.name.toLowerCase().includes(lowerSearchTerm) ||
                       (p.sku?.toLowerCase() || '').includes(lowerSearchTerm)
                     );
                     setFilteredProducts(filtered);
                   }}
                   className="w-full px-4 py-2 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                 />
               </div>

               {/* Product Suggestions List */}
               <div className="max-h-[200px] overflow-y-auto space-y-1 border rounded p-2">
                 {filteredProducts.map((product) => (
                   <button
                     key={product._id ?? product.sku ?? product.name}
                     type="button"
                     onClick={() => handleAddProduct(product)}
                     className="w-full flex items-center justify-between p-2 rounded hover:bg-blue-50 focus:outline-none"
                   >
                     <span className="text-sm text-left">{product.name}</span>
                     {typeof product.price === 'number' && !isNaN(product.price) && (
                       <span className="text-xs text-gray-500 ml-2">${product.price.toFixed(2)}</span>
                     )}
                   </button>
                 ))}
               </div>

               {/* Show 'Create Product' button for Expenses if term entered and no exact match */}
               {formData.type === 'expense' && 
                productSearchTerm.trim() && 
                !isCreatingProduct && // Don't show if already creating
                !filteredProducts.some(p => p.name.toLowerCase() === productSearchTerm.trim().toLowerCase()) && (
                  <div className="mt-2 text-center">
                    <Button 
                      type="button" 
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsCreatingProduct(true); // Show the new product form
                        // Reset checkbox state when starting a new creation
                        setIsIngredientChecked(false); 
                        setNewProductFormData({ 
                          // Initialize without isIngredient field
                          name: productSearchTerm.trim(),
                          sku: productSearchTerm.trim().toLowerCase().replace(/\s+/g, '-').substring(0, 30),
                          category: 'Uncategorized', 
                          price: 0, 
                          lastPurchasePrice: 0, 
                          stock: 0,
                          active: true,
                          baseProductName: productSearchTerm.trim(),
                          variantName: 'Default',
                          minimumStock: 0,
                          averageCost: 0,
                          costHistory: [],
                          totalSpent: 0,
                          totalPurchased: 0,
                          platformMetadata: [],
                          syncStatus: { lastSyncAttempt: '', lastSuccessfulSync: '', errors: [] },
                          // Ensure other potentially required Partial<Product> fields have defaults
                          description: '',
                          barcode: '',
                          supplier: '',
                          isProxied: false,
                        }); 
                      }}
                      className="text-blue-600 border-blue-300 hover:bg-blue-50"
                    >
                      Create &quot;{productSearchTerm.trim()}&quot; as new product
                    </Button>
                  </div>
                )}

                {/* --- New Product Form --- */}
                {isCreatingProduct && (
                  <div className="mt-4 p-4 border rounded bg-gray-50 space-y-3">
                    <h4 className="text-md font-medium mb-2">Create New Product</h4>
                    {/* Add Name Input */}
                     <div>
                      <label className="block text-sm font-medium text-gray-700">Product Name</label>
                      <Input 
                        type="text" 
                        value={newProductFormData.name || ''}
                        onChange={(e) => setNewProductFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="mt-1 block w-full"
                        required // Make Name required
                      />
                    </div>
                    {/* Existing fields: SKU, Cost, Ingredient Checkbox, Retail Price */}
                     <div>
                      <label className="block text-sm font-medium text-gray-700">SKU</label>
                      <Input 
                        type="text" 
                        value={newProductFormData.sku || ''}
                        onChange={(e) => setNewProductFormData(prev => ({ ...prev, sku: e.target.value }))}
                        className="mt-1 block w-full"
                        required // Make SKU required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Cost ($)</label>
                      <Input 
                        type="number" 
                        step="0.01"
                        min="0"
                        value={newProductFormData.lastPurchasePrice || 0} // Map to lastPurchasePrice
                        onChange={(e) => setNewProductFormData(prev => ({ ...prev, lastPurchasePrice: parseFloat(e.target.value) || 0 }))}
                        className="mt-1 block w-full"
                        required // Make Cost required
                      />
                    </div>
                    <div className="flex items-center mt-2">
                       <input
                         id="is-ingredient-checkbox"
                         type="checkbox"
                         checked={isIngredientChecked} // Use separate state
                         onChange={(e) => {
                           setIsIngredientChecked(e.target.checked); // Update separate state
                           // Optionally clear/set price in main form data if needed when box changes
                           if (e.target.checked) {
                              setNewProductFormData(prev => ({ ...prev, price: 0 }));
                           }
                         }}
                         className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                       />
                       <label htmlFor="is-ingredient-checkbox" className="ml-2 block text-sm text-gray-900">
                         Is Ingredient? (No Retail Price)
                       </label>
                     </div>

                    {/* Conditionally Render Retail Price Input based on separate state */}
                    {!isIngredientChecked && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Retail Price ($)</label>
                        <Input 
                          type="number" 
                          step="0.01"
                          min="0"
                          value={newProductFormData.price || 0}
                          onChange={(e) => setNewProductFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                          className="mt-1 block w-full"
                        />
                      </div>
                    )}
                    
                    <div className="flex justify-end gap-2 pt-2">
                      <Button 
                        type="button" 
                        variant="ghost" 
                        onClick={() => {
                           setIsCreatingProduct(false);
                           setIsIngredientChecked(false); // Reset checkbox state on cancel
                        }}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="button" 
                        onClick={handleSaveNewProduct}
                        className="bg-blue-500 hover:bg-blue-600 text-white"
                      >
                        Save Product
                      </Button>
                    </div>
                  </div>
                )}
                {/* --- End New Product Form --- */}

               {/* Selected Products List (Hide when creating new product) */}
               {!isCreatingProduct && (formData.type === 'sale' || formData.type === 'expense') && formData.products && formData.products.length > 0 && (
                 <div ref={selectedProductsRef} className="space-y-2 sticky bottom-14 left-0 right-0 bg-white border-t pt-2 max-h-[40vh] overflow-y-auto">
                   <h4 className="text-sm font-medium">Selected Products</h4>
                   {formData.products.map((product, index) => (
                     <div key={index} className="flex flex-col gap-1 p-1 border rounded">
                       <div className="flex items-center justify-between">
                         <span className="text-sm font-medium">{product.name}</span>
                         <button
                           type="button"
                           onClick={() => handleRemoveProduct(index)}
                           className="text-red-500 hover:text-red-700 px-2"
                         >
                           ×
                         </button>
                       </div>

                       {/* Controls row */}
                       <div className="flex items-center gap-2 flex-wrap">
                         <input
                           type="number"
                           step="0.01"
                           min="0.01"
                           value={product.quantity}
                           onChange={(e) => handleUpdateProductQuantity(index, parseFloat(e.target.value) || 0)}
                           onFocus={(e) => (e.target as HTMLInputElement).select()}
                           className="w-20 px-2 py-1 border rounded"
                         />
                         {/* Unit Price (expense only) */}
                         <span className="text-sm">@</span>
                         <input
                           type="number"
                           step="0.01"
                           min="0"
                           value={product.unitPrice}
                           onChange={(e) => handleUpdateProductUnitPrice(index, parseFloat(e.target.value) || 0)}
                           onFocus={(e) => (e.target as HTMLInputElement).select()}
                           className="w-20 px-2 py-1 border rounded text-sm text-right"
                           aria-label={`Unit price for ${product.name}`}
                           disabled={false}
                         />
                         <span className="text-sm">= $</span>
                         <input
                           type="number"
                           step="0.01"
                           min="0"
                           value={(product.totalPrice ?? (product.unitPrice * product.quantity)).toFixed(2)}
                           onChange={(e) => handleUpdateProductTotalPrice(index, parseFloat(e.target.value) || 0)}
                           onFocus={(e) => (e.target as HTMLInputElement).select()}
                           className="w-24 px-2 py-1 border rounded text-sm font-medium text-right"
                           aria-label={`Total price for ${product.name}`}
                           disabled={false}
                         />
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
          )}

          {/* Expense Specific Section (Category, Supplier, etc.) */}
          {formData.type === 'expense' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Expense Details</h2>
              {/* Category Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Inventory", "Equipment", "Advertising", "Rent", "Software", 
                    "Insurance", "Shipping", "Transit", "Bank fees", "Interest", "Other"
                  ].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, category: cat }));
                        setShowOtherCategoryInput(cat === 'Other');
                      }}
                      className={`px-3 py-1 rounded-full text-sm border ${ 
                        formData.category === cat
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {showOtherCategoryInput && (
                  <input
                    type="text"
                    placeholder="Specify other category"
                    value={formData.category === 'Other' ? '' : formData.category} // Show entered text if not 'Other' itself
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                )}
              </div>

              {/* Supplier and Order Number */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Supplier Input (value mapped to merchant on submit) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Supplier</label>
                  <input
                    type="text"
                    value={formData.supplier || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                {/* Supplier Order Number Input */}
                 <div>
                   <label className="block text-sm font-medium text-gray-700">Supplier Order Number</label>
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
                    value={formData.type === 'training' ? formData.trainer : ''}
                    onChange={(e) => {
                      if (formData.type === 'training') {
                        setFormData(prev => ({ ...(prev as TrainingFormData), trainer: e.target.value }));
                      }
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Client Name</label>
                  <input
                    type="text"
                    value={formData.type === 'training' ? formData.clientName : ''}
                    onChange={(e) => {
                      if (formData.type === 'training') {
                        setFormData(prev => ({ ...(prev as TrainingFormData), clientName: e.target.value }));
                      }
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Dog Name</label>
                  <input
                    type="text"
                    value={formData.type === 'training' ? formData.dogName : ''}
                    onChange={(e) => {
                      if (formData.type === 'training') {
                        setFormData(prev => ({ ...(prev as TrainingFormData), dogName: e.target.value }));
                      }
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Training Agency</label>
                  <input
                    type="text"
                    value={formData.type === 'training' ? formData.trainingAgency : ''}
                    onChange={(e) => {
                      if (formData.type === 'training') {
                        setFormData(prev => ({ ...(prev as TrainingFormData), trainingAgency: e.target.value }));
                      }
                    }}
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
          <div className="flex justify-end sticky bottom-0 left-0 right-0 bg-white py-2 border-t z-20">
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

// ---------- Responsive wrapper & mobile variant ----------

// Simple hook to detect if the viewport is desktop-sized. Defaults to `true` during SSR.
function useIsDesktop(breakpoint: number = 768) {
  const [isDesktop, setIsDesktop] = useState(
    typeof window === "undefined" ? true : window.innerWidth >= breakpoint
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= breakpoint);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isDesktop;
}

// Mobile implementation. Currently re-uses the desktop modal so behaviour stays unchanged.
// Modify this component to tailor the mobile experience separately from the desktop one.
function NewSaleModalMobile(props: NewSaleModalProps) {
  return <NewSaleModalDesktop {...props} />;
}

// Public component: automatically switches between desktop & mobile variants.
export function NewSaleModal(props: NewSaleModalProps) {
  const isDesktop = useIsDesktop();
  return isDesktop ? (
    <NewSaleModalDesktop {...props} />
  ) : (
    <NewSaleModalMobile {...props} />
  );
} 