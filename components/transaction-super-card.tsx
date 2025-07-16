'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Transaction {
  _id: string
  date: string
  amount: number
  type: 'sale' | 'expense' | 'training'
  source: 'manual' | 'shopify' | 'square' | 'amex'
  merchant?: string
  supplier?: string
  customer?: string
  emailId?: string
  purchaseCategory?: string
  invoiceEmailId?: string
  draft?: boolean
  products?: Array<{
    productId?: string
    name: string
    quantity: number
    unitPrice: number
    totalPrice: number
    costDiscount?: number
  }>
  clientName?: string
  dogName?: string
  trainer?: string
  revenue?: number
  taxAmount?: number
  trainingAgency?: string
  description?: string
  paymentMethod?: string
  isTaxable?: boolean
  preTaxAmount?: number
  tip?: number
  discount?: number
  shipping?: number
}

interface EmailParsingPattern {
  pattern: string
  flags?: string
  groupIndex: number
  transform?: string
}

interface EmailParsingConfig {
  orderNumber?: EmailParsingPattern
  total?: EmailParsingPattern
  subtotal?: EmailParsingPattern
  shipping?: EmailParsingPattern
  tax?: EmailParsingPattern
  discount?: EmailParsingPattern
  products?: {
    items: {
      name: EmailParsingPattern
      quantity: EmailParsingPattern
      total: EmailParsingPattern
    }
    costDiscount?: number
    wholesaleDiscount?: number
    quantityMultiple?: number
  }
  contentBounds?: {
    startPattern?: EmailParsingPattern
    endPattern?: EmailParsingPattern
  }
}

interface Supplier {
  id: string
  name: string
  invoiceEmail?: string
  invoiceSubjectPattern?: string
  emailParsing?: EmailParsingConfig
}

interface InvoiceEmail {
  _id: string
  emailId: string
  date: string
  subject: string
  from: string
  body: string
  status: string
  supplierId?: string
  supplier?: Supplier
  transactionId?: string
  createdAt: string
  updatedAt: Date
}

interface ParsingResult {
  value: string | null
  match: string | null
  pattern?: string
  products?: Array<{
    name: string
    quantity: number
    total: number
    costDiscount?: number
    productId?: string
    dbName?: string
  }>
}

type ParsingField = 'orderNumber' | 'total' | 'subtotal' | 'shipping' | 'tax' | 'discount' | 'products'

interface TransactionSuperCardProps {
  transaction: Transaction
  invoiceEmail: InvoiceEmail
  parsingResults?: Record<ParsingField, ParsingResult>
  expandedTransactionProducts: { [key: string]: boolean }
  onToggleTransactionProducts: (transactionId: string, e: React.MouseEvent) => void
  onDeleteTransaction: (id: string) => void
  onParseWithAI: (email: InvoiceEmail) => void
  onToggleParsingMode: (emailId: string) => void
  onSaveAITraining: (email: InvoiceEmail) => void
  onOpenLinkingModal: (email: InvoiceEmail) => void
  isParsingMode: boolean
  selectedEmail: string | null
  aiLoadingEmail: string | null
  linkingEmailId: string | null
  deletingId: string | null
  formatCurrency: (value: string | number | null) => string
  renderEmailBodyWithHighlights: (body: string, parsingResults: Record<ParsingField, ParsingResult>) => React.ReactNode
}

export function TransactionSuperCard({
  transaction,
  invoiceEmail,
  parsingResults,
  expandedTransactionProducts,
  onToggleTransactionProducts,
  onDeleteTransaction,
  onParseWithAI,
  onToggleParsingMode,
  onSaveAITraining,
  onOpenLinkingModal,
  isParsingMode,
  selectedEmail,
  aiLoadingEmail,
  linkingEmailId,
  deletingId,
  formatCurrency,
  renderEmailBodyWithHighlights
}: TransactionSuperCardProps) {
  const [showEmailBody, setShowEmailBody] = useState(false)
  const isHtml = invoiceEmail.body.trim().toLowerCase().startsWith('<html')
  const hasParsingResults = parsingResults && Object.values(parsingResults).some(r => r.value)

  return (
    <div className="bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border-2 border-purple-200 relative group">
      {/* Glowing border effect on hover */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-400/20 via-blue-400/20 to-indigo-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      
      {/* Header with enhanced styling */}
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-xl font-bold text-gray-900">
                {transaction.supplier || transaction.merchant || 'Unknown'}
              </h3>
              <div className="flex gap-2">
                <span className="px-3 py-1 text-sm font-semibold rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-sm">
                  💼 Transaction
                </span>
                <span className="px-3 py-1 text-sm font-semibold rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-sm">
                  📧 Invoice Email
                </span>
                {transaction.draft && (
                  <span className="px-3 py-1 text-sm font-semibold rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-sm">
                    📝 Draft
                  </span>
                )}
                {transaction.source === 'amex' && (
                  <span className="px-3 py-1 text-sm font-semibold rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm">
                    💳 Amex
                  </span>
                )}
                {transaction.products && transaction.products.length > 0 && (
                  <span className="px-3 py-1 text-sm font-semibold rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm">
                    📦 {transaction.products.length} Products
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
              <span>{new Date(transaction.date).toLocaleDateString()}</span>
              <span>•</span>
              <span className="capitalize">{transaction.type}</span>
              <span>•</span>
              <span className="capitalize">{transaction.source}</span>
              {transaction.purchaseCategory && (
                <>
                  <span>•</span>
                  <span>{transaction.purchaseCategory}</span>
                </>
              )}
            </div>

            {/* Email subject line */}
            <div className="mb-3">
              <p className="text-sm text-gray-700 font-medium">
                📧 {invoiceEmail.subject}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                From: {invoiceEmail.from.split('<')[0].trim()}
              </p>
            </div>

            {/* Parsed values display */}
            {hasParsingResults && (
              <div className="mb-4 p-3 bg-white/80 backdrop-blur-sm rounded-lg border border-purple-200">
                <p className="text-sm font-semibold text-purple-800 mb-2">📊 Extracted Data:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(parsingResults).map(([field, result]) => 
                    result.value && (
                      <span 
                        key={field}
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          field === 'orderNumber' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          field === 'total' ? 'bg-purple-100 text-purple-800 border border-purple-200 font-semibold' :
                          field === 'subtotal' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                          field === 'shipping' || field === 'tax' ? 
                            parseFloat(result.value) > 0 ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-green-100 text-green-800 border border-green-200' :
                          field === 'discount' ? 'bg-green-100 text-green-800 border border-green-200' :
                          field === 'products' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}
                      >
                        {field === 'orderNumber' ? (
                          <>#{result.value}</>
                        ) : field === 'products' ? (
                          <>Products: {result.value} items</>
                        ) : (
                          <>
                            {field.charAt(0).toUpperCase() + field.slice(1)}: {
                              ['total', 'subtotal', 'shipping', 'tax'].includes(field) ?
                                formatCurrency(result.value) :
                                field === 'discount' ?
                                  `-${formatCurrency((typeof result.value === 'number' ? String(result.value) : (result.value || '')).replace('-', ''))}` :
                                  result.value
                            }
                          </>
                        )}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Amount and actions */}
          <div className="text-right flex-shrink-0">
            <div className="text-2xl font-bold text-gray-900 mb-2">
              ${transaction.amount.toFixed(2)}
            </div>
            
            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              {invoiceEmail.supplier && (
                <>
                  <Button
                    onClick={() => onParseWithAI(invoiceEmail)}
                    disabled={aiLoadingEmail === invoiceEmail._id}
                    size="sm"
                    variant="outline"
                    className="text-xs bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100"
                  >
                    {aiLoadingEmail === invoiceEmail._id ? 'Parsing…' : 'Parse with AI'}
                  </Button>

                  <Button 
                    onClick={() => onToggleParsingMode(invoiceEmail._id)} 
                    size="sm"
                    variant="outline"
                    className={`text-xs ${
                      isParsingMode && selectedEmail === invoiceEmail._id 
                        ? 'bg-purple-500 text-white border-purple-500' 
                        : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                    }`}
                  >
                    {isParsingMode && selectedEmail === invoiceEmail._id ? 'Exit Parsing' : 'Parse Email'}
                  </Button>
                  
                  {hasParsingResults && (
                    <Button
                      onClick={() => onSaveAITraining(invoiceEmail)}
                      size="sm"
                      variant="outline"
                      className="text-xs bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                    >
                      Save as Correct
                    </Button>
                  )}
                  
                  <Button
                    onClick={() => onOpenLinkingModal(invoiceEmail)}
                    disabled={linkingEmailId === invoiceEmail._id}
                    size="sm"
                    variant="outline"
                    className={`text-xs ${
                      invoiceEmail.transactionId 
                        ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' 
                        : 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
                    } ${linkingEmailId === invoiceEmail._id ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {linkingEmailId === invoiceEmail._id ? 'Linking...' : (invoiceEmail.transactionId ? 'Change Link' : 'Link to Transaction')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Training-specific details */}
        {transaction.type === 'training' && (
          <div className="mb-4 p-3 bg-white/80 backdrop-blur-sm rounded-lg border border-purple-200">
            <div className="space-y-1 text-sm text-gray-700">
              {transaction.dogName && (
                <div>🐕 Dog: <span className="font-medium">{transaction.dogName}</span></div>
              )}
              {transaction.trainer && (
                <div>👨‍🏫 Trainer: <span className="font-medium">{transaction.trainer}</span></div>
              )}
              {(() => {
                const revenue = typeof transaction.revenue === 'number' ? transaction.revenue : transaction.amount
                const taxable = !transaction.trainingAgency
                const salesTax = typeof transaction.taxAmount === 'number' ? transaction.taxAmount : (taxable ? parseFloat(((revenue * 0.08875) / 1.08875).toFixed(2)) : 0)
                const sale = revenue - salesTax
                return (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 text-xs">Revenue: {formatCurrency(revenue)}</span>
                    {taxable && (
                      <>
                        <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 text-xs">Sale: {formatCurrency(sale)}</span>
                        <span className="px-2 py-1 rounded bg-pink-50 text-pink-700 text-xs">Sales Tax: {formatCurrency(salesTax)}</span>
                      </>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* Products section */}
        {transaction.products && transaction.products.length > 0 && (
          <div className="mb-4">
            <button
              onClick={(e) => onToggleTransactionProducts(transaction._id, e)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              <span>📦 Products ({transaction.products.length})</span>
              {expandedTransactionProducts[transaction._id] ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
            
            {expandedTransactionProducts[transaction._id] && (
              <div className="mt-2 p-3 bg-white/80 backdrop-blur-sm rounded-lg border border-purple-200">
                <div className="space-y-2">
                  {transaction.products.map((product, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                      <span className="flex-1">{product.quantity}x {product.name}</span>
                      <span className="font-medium">{formatCurrency(product.totalPrice)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Email body toggle */}
        <div className="mb-4">
          <button
            onClick={() => setShowEmailBody(!showEmailBody)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            <span>📄 Email Content</span>
            {showEmailBody ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
          
          {showEmailBody && (
            <div className="mt-3 p-4 bg-white/90 backdrop-blur-sm rounded-lg border border-purple-200 overflow-x-auto">
              {isHtml ? (
                <div className="prose max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: invoiceEmail.body }} />
                </div>
              ) : (
                <pre className="font-mono text-sm whitespace-pre-wrap">
                  {hasParsingResults ? (
                    renderEmailBodyWithHighlights(invoiceEmail.body, parsingResults)
                  ) : (
                    invoiceEmail.body
                  )}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={() => onDeleteTransaction(transaction._id)}
        disabled={deletingId === transaction._id}
        className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200"
      >
        {deletingId === transaction._id ? (
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        )}
      </button>
    </div>
  )
} 