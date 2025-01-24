'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type Product } from '@/types'
import { Loader2, Mail, ArrowLeft, Check, Copy } from 'lucide-react'
import Link from 'next/link'

export default function NewAmexTransaction({ searchParams }: { searchParams: { emailId?: string } }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isFetchingEmail, setIsFetchingEmail] = useState(false)
  const [emailPreview, setEmailPreview] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [emailSkip, setEmailSkip] = useState(0)
  const [isLastEmail, setIsLastEmail] = useState(false)

  // Form state
  const [amount, setAmount] = useState(0)
  const [description, setDescription] = useState('')
  const [supplier, setSupplier] = useState('')
  const [supplierOrderNumber, setSupplierOrderNumber] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<Array<{
    productId: string
    name: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }>>([])

  // Add a computed total that updates whenever selectedProducts changes
  const productsTotal = useMemo(() => {
    return selectedProducts.reduce((sum, product) => sum + product.totalPrice, 0)
  }, [selectedProducts])

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch products data
        const productsResponse = await fetch('/api/products')
        const productsData = await productsResponse.json()

        if (!productsResponse.ok) {
          throw new Error('Failed to fetch products')
        }

        console.log('Loaded products from database:', productsData.products.map((p: Product) => ({
          name: p.name,
          id: p.id
        })))

        setProducts(productsData.products)

        // If we have an emailId, fetch the email details
        if (searchParams.emailId) {
          handleFetchEmailDetails(0)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [searchParams.emailId])

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
      unitPrice: product.lastPurchasePrice,
      totalPrice: product.lastPurchasePrice
    }])
    setSearchQuery('')
    setShowSuggestions(false)
  }

  const handleQuantityChange = (index: number, newQuantity: number) => {
    setSelectedProducts(products => products.map((product, i) => {
      if (i === index) {
        return {
          ...product,
          quantity: newQuantity,
          totalPrice: Number((product.unitPrice * newQuantity).toFixed(2))
        }
      }
      return product
    }))
  }

  const handleUnitPriceChange = (index: number, newUnitPrice: number) => {
    setSelectedProducts(products => products.map((product, i) => {
      if (i === index) {
        const roundedUnitPrice = Number(newUnitPrice.toFixed(2))
        return {
          ...product,
          unitPrice: roundedUnitPrice,
          totalPrice: Number((roundedUnitPrice * product.quantity).toFixed(2))
        }
      }
      return product
    }))
  }

  const handleTotalPriceChange = (index: number, newTotalPrice: number) => {
    setSelectedProducts(products => products.map((product, i) => {
      if (i === index) {
        const roundedTotalPrice = Number(newTotalPrice.toFixed(2))
        return {
          ...product,
          totalPrice: roundedTotalPrice,
          unitPrice: Number((roundedTotalPrice / product.quantity).toFixed(2))
        }
      }
      return product
    }))
  }

  const handleRemoveProduct = (index: number) => {
    setSelectedProducts(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    try {
      console.log('Starting save process...')
      setSaving(true)

      // Log the current state of selectedProducts
      console.log('Current selected products:', selectedProducts)

      // First create the transaction
      console.log('Creating transaction...')
      const response = await fetch('/api/gmail/amex/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: `${searchParams.emailId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          amount,
          description,
          supplier,
          supplierOrderNumber,
          products: selectedProducts,
          emailId: searchParams.emailId,
          source: 'gmail',
          type: 'purchase',
          date: new Date().toISOString(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Transaction creation failed:', {
          status: response.status,
          error: errorData
        })
        throw new Error('Failed to create transaction')
      }

      console.log('Transaction created successfully')
      console.log('Selected products to process:', selectedProducts)

      // Then update cost history for each product
      console.log('Starting cost history updates...')
      for (const product of selectedProducts) {
        console.log('\nProcessing product:', {
          name: product.name,
          productId: product.productId,
          quantity: product.quantity,
          unitPrice: product.unitPrice,
          totalPrice: product.totalPrice
        })

        if (!product.productId) {
          const error = `Missing product ID for ${product.name}`
          console.error(error, {
            product,
            allProducts: selectedProducts
          })
          throw new Error(error)
        }

        const costEntry = {
          date: new Date().toISOString(),
          quantity: product.quantity,
          unitPrice: product.unitPrice,
          totalPrice: product.totalPrice,
          source: 'gmail',
          invoiceId: searchParams.emailId,
          notes: `AMEX purchase from ${supplier || 'unknown supplier'}`
        }

        const requestBody = {
          productId: product.productId,
          entry: costEntry
        }

        console.log('Sending cost history update request:', {
          url: '/api/products/cost-history',
          method: 'POST',
          body: requestBody
        })

        const costResponse = await fetch('/api/products/cost-history', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        })

        if (!costResponse.ok) {
          const errorData = await costResponse.json()
          console.error('Cost history update failed:', {
            product: product.name,
            status: costResponse.status,
            error: errorData
          })
          throw new Error(`Failed to update cost history for product ${product.name}`)
        }

        console.log('Cost history updated successfully for:', product.name)
      }

      console.log('All updates completed successfully')
      router.push('/')
    } catch (err) {
      console.error('Save process failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to create transaction')
    } finally {
      setSaving(false)
    }
  }

  const handleFetchEmailDetails = async (skipCount?: number) => {
    try {
      setIsFetchingEmail(true)
      setError(null)
      const skip = skipCount ?? emailSkip
      const response = await fetch(`/api/gmail/amex/email?emailId=${searchParams.emailId}&skip=${skip}`)
      const data = await response.json()
      
      if (data.error) {
        setError(data.error)
        return
      }

      if (data.extractedSupplier) {
        setSupplier(data.extractedSupplier)
      } else {
        setError('Could not find supplier name in email')
      }

      // Set email preview
      setEmailPreview(data.emailBody)
      setIsLastEmail(data.isLastEmail)

      // Handle parsed data if available
      if (data.parsedData) {
        // Set order number if found
        if (data.parsedData.orderNumber) {
          setSupplierOrderNumber(data.parsedData.orderNumber)
        }

        // Set products if found
        if (data.parsedData.products && data.parsedData.products.length > 0) {
          // Define the product type
          type ParsedProduct = {
            name: string
            quantity: number
            unitPrice: number
            totalPrice: number
          }

          // First, deduplicate products by name (keeping only first occurrence)
          const uniqueProducts: ParsedProduct[] = Array.from(
            data.parsedData.products.reduce((map: Map<string, ParsedProduct>, product: ParsedProduct) => {
              // Only add the product if we haven't seen its name before
              if (!map.has(product.name)) {
                map.set(product.name, product)
              }
              return map
            }, new Map()).values()
          )

          // Try to match each product with our database
          const productMatches = await Promise.all(
            uniqueProducts.map(async (parsedProduct: ParsedProduct) => {
              // Map short names to full product names
              let searchName = parsedProduct.name
              console.log('\nMatching product:', {
                originalName: parsedProduct.name,
                type: parsedProduct.name.includes('Pure') ? 'Pure product' : 
                      parsedProduct.name.includes('for') ? 'For Cats/Dogs product' : 'Other'
              })

              if (searchName.includes('Pure')) {
                // Handle Pure products (e.g. "Pure Turkey" -> "Viva Raw Pure Turkey 1 lb - Regular")
                const protein = searchName.split(' ')[1]
                searchName = `Viva Raw Pure ${protein} 1 lb - Regular`
                console.log('Mapped Pure product:', { from: parsedProduct.name, to: searchName })
              } else if (searchName.includes('for')) {
                // Handle "for Cats/Dogs" products (e.g. "Duck for Cats" -> "Viva Raw Duck for Cats 1 lb - Regular")
                const [protein, , animal] = searchName.split(' ')
                // Try both with and without "1 lb - Regular" suffix
                const baseSearchName = `Viva Raw ${protein} for ${animal}`
                searchName = `${baseSearchName} 1 lb - Regular`
                console.log('Mapped For product:', { 
                  from: parsedProduct.name, 
                  to: searchName,
                  alternateSearch: baseSearchName
                })
              }

              // Search for the product in our database
              console.log('Searching for:', searchName)
              const searchResponse = await fetch(`/api/products/search?query=${encodeURIComponent(searchName)}`)
              const searchData = await searchResponse.json()
              
              // If no results and we're searching for a "for" product, try without the suffix
              if (searchName.includes('for') && (!searchData.products || searchData.products.length === 0)) {
                const baseSearchName = searchName.replace(' 1 lb - Regular', '')
                console.log('No results, trying without suffix:', baseSearchName)
                const alternateResponse = await fetch(`/api/products/search?query=${encodeURIComponent(baseSearchName)}`)
                const alternateData = await alternateResponse.json()
                if (alternateData.products && alternateData.products.length > 0) {
                  console.log('Found match with alternate search')
                  searchData.products = alternateData.products
                }
              }
              
              console.log('Search results:', {
                query: searchName,
                resultsCount: searchData.products?.length || 0,
                firstMatch: searchData.products?.[0]?.name || 'No match'
              })

              // Find the best matching product
              const bestMatch = searchData.products?.[0]
              
              if (bestMatch) {
                console.log('Found match:', {
                  name: bestMatch.name,
                  id: bestMatch.id,
                  productId: bestMatch.id,
                  lastPurchasePrice: bestMatch.lastPurchasePrice
                })
                
                // Double the quantity since email shows half quantities
                const actualQuantity = parsedProduct.quantity * 2
                
                // Round lastPurchasePrice to 2 decimal places and calculate total
                const unitPrice = Number(bestMatch.lastPurchasePrice.toFixed(2))
                const totalPrice = Number((unitPrice * actualQuantity).toFixed(2))
                
                const matchedProduct = {
                  productId: bestMatch.id,
                  name: bestMatch.name,
                  quantity: actualQuantity,
                  unitPrice,
                  totalPrice
                }

                console.log('Matched product details:', {
                  original: parsedProduct,
                  matched: matchedProduct,
                  bestMatch: {
                    id: bestMatch.id,
                    productId: bestMatch.id,
                    name: bestMatch.name
                  }
                })
                return matchedProduct
              }

              console.log(`Could not find match for product: ${searchName}`)
              return null
            })
          )

          // Filter out any products we couldn't match and set them
          const validProducts = productMatches.filter(p => p !== null)
          console.log('Setting selected products:', validProducts.map(p => ({
            name: p.name,
            productId: p.productId,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            totalPrice: p.totalPrice
          })))
          
          if (validProducts.length > 0) {
            setSelectedProducts(validProducts)
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch email details')
    } finally {
      setIsFetchingEmail(false)
    }
  }

  const handleTryNextEmail = () => {
    setEmailSkip(prev => prev + 1)
    handleFetchEmailDetails(emailSkip + 1)
  }

  const handleTryPreviousEmail = () => {
    const newSkip = Math.max(0, emailSkip - 1)
    setEmailSkip(newSkip)
    handleFetchEmailDetails(newSkip)
  }

  const handleCopyHtml = () => {
    if (emailPreview) {
      navigator.clipboard.writeText(emailPreview)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <Link href="/transactions/amex" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to AMEX Transactions
        </Link>
      </div>

      <Card className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">New AMEX Transaction</h1>

        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded-md mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description"
            />
          </div>

          <div className="flex gap-2 items-center">
            <Input
              placeholder="Supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="flex-1"
            />
            <div className="flex items-center gap-2 mb-4">
              {emailPreview && emailSkip > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTryPreviousEmail}
                  disabled={isFetchingEmail}
                >
                  {isFetchingEmail ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    'Try Previous Email'
                  )}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => handleFetchEmailDetails(0)}
                disabled={isFetchingEmail}
              >
                {isFetchingEmail ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Fetch Email Details
                  </>
                )}
              </Button>
              {emailPreview && !isLastEmail && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTryNextEmail}
                  disabled={isFetchingEmail}
                >
                  {isFetchingEmail ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    'Try Next Email'
                  )}
                </Button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Supplier Order Number</label>
            <Input
              value={supplierOrderNumber}
              onChange={(e) => setSupplierOrderNumber(e.target.value)}
              placeholder="Enter order number"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Products</label>
            <div className="space-y-4">
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
                                  SKU: {product.sku} - ${(product.lastPurchasePrice || 0).toFixed(2)}
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
              
              <div className="space-y-2">
                {selectedProducts.map((product, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      value={product.quantity}
                      onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                      className="w-16"
                    />
                    <span className="flex-grow">{product.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span>$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={product.unitPrice}
                          onChange={(e) => handleUnitPriceChange(index, Number(e.target.value) || 0)}
                          className="w-24"
                        />
                        <span>each</span>
                      </div>
                      <span>=</span>
                      <div className="flex items-center gap-1">
                        <span>$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={product.totalPrice}
                          onChange={(e) => handleTotalPriceChange(index, Number(e.target.value) || 0)}
                          className="w-24"
                        />
                        <span>total</span>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleRemoveProduct(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      ×
                    </Button>
                  </div>
                ))}

                {selectedProducts.length > 0 && (
                  <div className="flex justify-end items-center gap-2 pt-4 border-t">
                    <span className="font-medium">Products Total:</span>
                    <span className="text-lg font-semibold">${productsTotal.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {emailPreview && (
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Rendered Email Preview</h3>
                <div 
                  className="bg-white border rounded-md overflow-auto max-h-[400px]"
                  dangerouslySetInnerHTML={{ __html: emailPreview }}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Raw HTML</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyHtml}
                    className="h-8"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy HTML
                      </>
                    )}
                  </Button>
                </div>
                <div className="bg-gray-50 p-4 rounded-md text-sm font-mono whitespace-pre-wrap overflow-auto max-h-[400px]">
                  {emailPreview}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-4 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => router.push('/')}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
} 