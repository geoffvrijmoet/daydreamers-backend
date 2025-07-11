'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Transaction {
  _id: string;
  date: string;
  amount: number;
  type: 'sale' | 'expense' | 'training';
  source: 'manual' | 'shopify' | 'square' | 'amex';
  merchant?: string;
  supplier?: string;
  customer?: string;
  emailId?: string;
  purchaseCategory?: string;

  // Training-specific
  clientName?: string;
  dogName?: string;
  trainer?: string;
  revenue?: number;
  taxAmount?: number;
  trainingAgency?: string;
}

interface Supplier {
  id: string;
  name: string;
  invoiceEmail?: string;
  invoiceSubjectPattern?: string;
  emailParsing?: EmailParsingConfig;
}

interface EmailParsingPattern {
  pattern: string;
  flags?: string;
  groupIndex: number;
  transform?: string;
}

interface EmailParsingConfig {
  orderNumber?: EmailParsingPattern;
  total?: EmailParsingPattern;
  subtotal?: EmailParsingPattern;
  shipping?: EmailParsingPattern;
  tax?: EmailParsingPattern;
  discount?: EmailParsingPattern;
  products?: {
    items: {
      name: EmailParsingPattern;
      quantity: EmailParsingPattern;
      total: EmailParsingPattern;
    },
    /**
     * Percentage discount that should be applied to the cost of every product 
     * line on an invoice (e.g. 0.2 for a 20 % discount). This replaces the
     * older `wholesaleDiscount` field but the latter is still respected for
     * backwards-compatibility.
     */
    costDiscount?: number;
    /** @deprecated – use costDiscount */
    wholesaleDiscount?: number;
    quantityMultiple?: number;
  };
  contentBounds?: {
    startPattern?: EmailParsingPattern;
    endPattern?: EmailParsingPattern;
  };
}

interface InvoiceEmail {
  _id: string;
  emailId: string;
  date: string;
  subject: string;
  from: string;
  body: string;
  status: string;
  supplierId?: string;
  supplier?: Supplier;
  createdAt: string;
  updatedAt: Date;
}

// Amex alert email parsed txn
interface AmexTransaction {
  emailId: string;
  date: string;
  amount: number;
  merchant: string;
  cardLast4: string;
}

// Combined type for list items
type ListItem = {
  type: 'transaction' | 'invoice' | 'amex';
  date: string;
  data: Transaction | InvoiceEmail | AmexTransaction;
};

// Add this interface to track expanded state for each email
interface ExpandedState {
  [key: string]: boolean;
}

// Define the data fields we can extract
type ParsingField = 'orderNumber' | 'total' | 'subtotal' | 'shipping' | 'tax' | 'discount' | 'products';

// Define a product from email parsing
interface ParsedProduct {
  name: string;
  quantity: number;
  total: number;
  costDiscount?: number; // User input for cost discount (e.g., 0.20 for 20% off)
  productId?: string;
  dbName?: string;
}

// Define the parsing result structure
interface ParsingResult {
  value: string | null;
  match: string | null;
  pattern?: string;
  products?: ParsedProduct[]; // Array of parsed products
}

// Helper to format currency values
const formatCurrency = (value: string | number | null): string => {
  if (value === null || value === undefined) return '$0.00';
  
  // Ensure we operate on a string
  const strVal = typeof value === 'number' ? value.toString() : value;
  
  // Remove any existing $ or comma signs
  const numericValue = strVal.replace(/[$,]/g, '');
  
  try {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(parseFloat(numericValue));
  } catch {
    return `$${value}`;
  }
};

// Function to determine color class based on value type
const getValueColorClass = (field: ParsingField, value: string | null): string => {
  if (!value) return '';
  
  switch (field) {
    case 'shipping':
    case 'tax':
      return parseFloat(value) > 0 ? 'text-amber-700 bg-amber-50' : 'text-green-700 bg-green-50';
    case 'discount':
      return 'text-green-700 bg-green-50';
    case 'total':
      return 'text-purple-700 bg-purple-50 font-medium';
    case 'subtotal':
      return 'text-indigo-700 bg-indigo-50';
    default:
      return 'text-gray-700 bg-gray-50';
  }
};

// Highlight matched patterns in email body
const renderEmailBodyWithHighlights = (
  body: string,
  parsingResults: Record<ParsingField, ParsingResult>
): React.ReactNode => {
  // If no results to highlight, return plain body
  if (!Object.values(parsingResults).some(r => r.match)) {
    return body;
  }
  
  // Get all matches with their field types
  const highlights: { 
    field: ParsingField; 
    match: string; 
    index: number;
    length: number;
    color: string;
  }[] = [];
  
  Object.entries(parsingResults).forEach(([fieldName, result]) => {
    if (result.match) {
      const field = fieldName as ParsingField;
      const matchText = result.match;
      const index = body.indexOf(matchText);
      
      if (index >= 0) {
        let color;
        switch (field) {
          case 'orderNumber':
            color = 'bg-blue-100 text-blue-800';
            break;
          case 'total':
            color = 'bg-purple-100 text-purple-800';
            break;
          case 'subtotal':
            color = 'bg-indigo-100 text-indigo-800';
            break;
          case 'shipping':
            color = 'bg-amber-100 text-amber-800';
            break;
          case 'tax':
            color = 'bg-green-100 text-green-800';
            break;
          case 'discount':
            color = 'bg-pink-100 text-pink-800';
            break;
          default:
            color = 'bg-gray-100';
        }
        
        highlights.push({
          field,
          match: matchText,
          index,
          length: matchText.length,
          color
        });
      }
    }
  });
  
  // Sort highlights by index
  highlights.sort((a, b) => a.index - b.index);
  
  // Only highlight if we have valid matches
  if (highlights.length === 0) {
    return body;
  }
  
  // Create highlighted segments
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  
  highlights.forEach(({ index, length, match, color }, i) => {
    // Add text before the highlight
    if (index > lastIndex) {
      segments.push(body.substring(lastIndex, index));
    }
    
    // Add the highlighted part
    segments.push(
      <span key={i} className={`px-1 rounded ${color}`} title={`Matched pattern for ${match}`}>
        {body.substring(index, index + length)}
      </span>
    );
    
    lastIndex = index + length;
  });
  
  // Add any remaining text
  if (lastIndex < body.length) {
    segments.push(body.substring(lastIndex));
  }
  
  return segments;
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [invoiceEmails, setInvoiceEmails] = useState<InvoiceEmail[]>([]);
  const [amexTxns, setAmexTxns] = useState<AmexTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEmails, setExpandedEmails] = useState<ExpandedState>({});
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectedField, setSelectedField] = useState<ParsingField | null>(null);
  const [isParsingMode, setIsParsingMode] = useState(false);
  /* AI parsing */
  const [aiLoadingEmail, setAiLoadingEmail] = useState<string | null>(null);
  
  // Keep track of parsed field results
  const [parsingResults, setParsingResults] = useState<Record<string, Record<ParsingField, ParsingResult>>>({});
  // Keep track of parsing stats
  const [parsingStats, setParsingStats] = useState({
    totalEmails: 0,
    parsedEmails: 0,
    parsedFields: 0
  });

  const [productParsingState, setProductParsingState] = useState<{
    nameExamples: string[];
    quantityExamples: string[];
    totalExamples: string[];
    wholesaleDiscount?: number;
    quantityMultiple?: number;
    selectedPatternType?: 'name' | 'quantity' | 'total' | null;
  }>({
    nameExamples: [],
    quantityExamples: [],
    totalExamples: []
  });

  // NEW: Content bounds inputs state
  const [contentBoundsInputs, setContentBoundsInputs] = useState<{ startPattern: string; endPattern: string }>({
    startPattern: '',
    endPattern: ''
  });

  // Filter states
  const [activeFilter, setActiveFilter] = useState<'all' | 'sales' | 'expenses' | 'training' | 'invoices'>('all');

  // Date filter: all | thisMonth | thisYear | lastYear
  const [dateFilter, setDateFilter] = useState<'all' | 'thisMonth' | 'thisYear' | 'lastYear'>('thisYear');

  // product suggestions (keyed by `${emailId}-${rowIndex}`)
  type Suggestion = { _id: string; name: string };
  const [productSuggestions, setProductSuggestions] = useState<Record<string, Suggestion[]>>({});

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [showAmexMenu, setShowAmexMenu] = useState(false);

  const [previewAmex, setPreviewAmex] = useState<AmexTransaction | null>(null);
  const [savingAmex, setSavingAmex] = useState(false);
  const [draftPayload, setDraftPayload] = useState<string>('');

  const fetchProductSuggestions = async (term: string, emailId: string, index: number) => {
    if (!term) return;
    try {
      const res = await fetch(`/api/products/search?term=${encodeURIComponent(term)}`);
      if (res.ok) {
        const json = await res.json();
        setProductSuggestions(prev => ({
          ...prev,
          [`${emailId}-${index}`]: json.products || []
        }));
      }
    } catch (err) {
      console.error('product search error', err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Build transactions query based on dateFilter
        const buildTxnUrl = () => {
          let url = '/api/transactions?limit=1000'
          const today = new Date()
          const yr = today.getUTCFullYear()
          const month = today.getUTCMonth()

          let start: Date | undefined
          let end: Date | undefined

          if (dateFilter === 'thisYear') {
            start = new Date(Date.UTC(yr, 0, 1))
            end = new Date(Date.UTC(yr, 11, 31, 23, 59, 59, 999))
          } else if (dateFilter === 'lastYear') {
            start = new Date(Date.UTC(yr - 1, 0, 1))
            end = new Date(Date.UTC(yr - 1, 11, 31, 23, 59, 59, 999))
          } else if (dateFilter === 'thisMonth') {
            start = new Date(Date.UTC(yr, month, 1))
            end = new Date(Date.UTC(yr, month + 1, 0, 23, 59, 59, 999))
          }

          if (start) url += `&startDate=${start.toISOString()}`
          if (end) url += `&endDate=${end.toISOString()}`

          return url
        }

        const [transactionsRes, invoiceEmailsRes] = await Promise.all([
          fetch(buildTxnUrl()),
          fetch('/api/invoiceemails')
        ]);

        if (!transactionsRes.ok || !invoiceEmailsRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const [transactionsData, invoiceEmailsData] = await Promise.all([
          transactionsRes.json(),
          invoiceEmailsRes.json()
        ]);

        setTransactions(transactionsData.transactions);
        
        // TEMPORARY: Add test parsing config to first invoice email for testing
        const emails = invoiceEmailsData.invoiceEmails;
        if (emails && emails.length > 0 && emails[0].supplier) {
          // Make a deep copy to avoid reference issues
          const enhancedEmails = [...emails];
          
          // Add test parsing config to first email
          if (enhancedEmails[0].supplier) {
            console.log('Adding test parsing config to first email');
            enhancedEmails[0].supplier = {
              ...enhancedEmails[0].supplier,
              emailParsing: {
                total: {
                  pattern: 'Total:\\s*\\$(\\d+\\.\\d+)',
                  flags: 'm',
                  groupIndex: 1,
                  transform: 'parseFloat'
                },
                orderNumber: {
                  pattern: 'ORDER NUMBER:\\s*#(\\d+)',
                  flags: 'm',
                  groupIndex: 1,
                  transform: 'parseInt'
                }
              }
            };
          }
          
          setInvoiceEmails(enhancedEmails);
        } else {
          setInvoiceEmails(invoiceEmailsData.invoiceEmails);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [dateFilter]);

  // Process emails to extract values based on supplier's parsing config
  useEffect(() => {
    const newParsingResults: Record<string, Record<ParsingField, ParsingResult>> = {};
    let parsedEmails = 0;
    let parsedFields = 0;

    console.log('Starting to parse invoice emails...');
    console.log('Number of emails to process:', invoiceEmails.length);

    invoiceEmails.forEach(email => {
      // Log email info
      console.log(`Processing email ${email._id} - Subject: ${email.subject}`);
      console.log(`Email has supplier: ${!!email.supplier}`);
      
      if (email.supplier) {
        console.log(`Supplier name: ${email.supplier.name}`);
        console.log(`Supplier has emailParsing: ${!!email.supplier.emailParsing}`);
        
        if (email.supplier.emailParsing) {
          console.log('Email parsing config:', JSON.stringify(email.supplier.emailParsing, null, 2));
        }
      }

      if (email.supplier?.emailParsing) {
        const results: Record<ParsingField, ParsingResult> = {
          orderNumber: { value: null, match: null },
          total: { value: null, match: null },
          subtotal: { value: null, match: null },
          shipping: { value: null, match: null },
          tax: { value: null, match: null },
          discount: { value: null, match: null },
          products: { value: null, match: null, products: [] }
        };
        
        let emailHasResults = false;

        // Process each field in the config
        Object.entries(email.supplier.emailParsing).forEach(([field, config]) => {
          if (config && field in results) {
            const fieldName = field as ParsingField;
            
            // Special handling for products field
            if (fieldName === 'products' && email.supplier?.emailParsing?.products) {
              try {
                console.log(`Trying to parse products for email ${email._id}`);
                const productResults = extractProductsFromEmail(email.body, email.supplier.emailParsing.products);
                
                if (productResults && productResults.products.length > 0) {
                  console.log(`Found ${productResults.products.length} products:`, productResults.products);
                  
                  results.products = {
                    value: String(productResults.products.length),
                    match: 'Products found',
                    products: productResults.products
                  };
                  
                  emailHasResults = true;
                  parsedFields++;
                } else {
                  console.log('No products found or parsing failed');
                }
              } catch (e) {
                console.error(`Error parsing products:`, e);
              }
            } else {
              // Handle regular fields (non-products)
              try {
                console.log(`Trying to parse field: ${field}`);
                console.log(`Pattern: ${config.pattern}`);
                console.log(`Flags: ${config.flags || 'none'}`);
                
                const regex = new RegExp(config.pattern, config.flags || '');
                const match = email.body.match(regex);
                
                console.log(`Match result: ${match ? 'Found match' : 'No match'}`);
                
                if (match && match[config.groupIndex]) {
                  let value = match[config.groupIndex];
                  console.log(`Raw value: ${value}`);
                  
                  // Apply transformation if specified
                  if (config.transform === 'parseFloat') {
                    value = parseFloat(value).toString();
                  } else if (config.transform === 'parseInt') {
                    value = parseInt(value).toString();
                  } else if (config.transform === 'trim') {
                    value = value.trim();
                  }
                  
                  console.log(`Transformed value: ${value}`);
                  
                  results[fieldName] = { 
                    value: value, 
                    match: match[0],
                    pattern: config.pattern 
                  };
                  
                  emailHasResults = true;
                  parsedFields++;
                }
              } catch (e) {
                console.error(`Error parsing ${field}:`, e);
              }
            }
          }
        });
        
        if (emailHasResults) {
          parsedEmails++;
        }
        
        newParsingResults[email._id] = results;
      } else {
        // Create empty results for emails with no parsing config
        newParsingResults[email._id] = {
          orderNumber: { value: null, match: null },
          total: { value: null, match: null },
          subtotal: { value: null, match: null },
          shipping: { value: null, match: null },
          tax: { value: null, match: null },
          discount: { value: null, match: null },
          products: { value: null, match: null, products: [] }
        };
      }
    });

    console.log(`Parsed results:`, newParsingResults);
    console.log(`Stats: ${parsedEmails} emails parsed, ${parsedFields} fields extracted`);

    setParsingResults(newParsingResults);
    setParsingStats({
      totalEmails: invoiceEmails.length,
      parsedEmails,
      parsedFields
    });
  }, [invoiceEmails]);

  const toggleEmailBody = (emailId: string, e: React.MouseEvent) => {
    // Only toggle if clicking on the header, not the body
    if (!(e.target as HTMLElement).closest('.email-body')) {
      setExpandedEmails(prev => ({
        ...prev,
        [emailId]: !prev[emailId]
      }));
      if (!expandedEmails[emailId]) {
        setSelectedEmail(emailId)
      }
    }
  };

  const toggleParsingMode = (emailId: string) => {
    setIsParsingMode(prev => !prev);
    setSelectedEmail(emailId);
    setSelectedField(null);
    setSelectedText('');
    // Initialise content bounds inputs for this email (if available)
    const email = invoiceEmails.find(e => e._id === emailId);
    if (email?.supplier?.emailParsing?.contentBounds) {
      setContentBoundsInputs({
        startPattern: email.supplier.emailParsing.contentBounds.startPattern?.pattern || '',
        endPattern: email.supplier.emailParsing.contentBounds.endPattern?.pattern || ''
      });
    } else {
      setContentBoundsInputs({ startPattern: '', endPattern: '' });
    }
  };

  const handleTextSelection = () => {
    if (!isParsingMode || !selectedEmail) return;
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    const text = selection.toString().trim();
    if (text) {
      setSelectedText(text);
      
      // If we're in products mode and have a selected pattern type, auto-add the example
      if (selectedField === 'products' && productParsingState.selectedPatternType) {
        const action = productParsingState.selectedPatternType;
        
        setProductParsingState(prev => {
          const newState = { ...prev };
          
          switch (action) {
            case 'name':
              newState.nameExamples = [...newState.nameExamples, text];
              break;
            case 'quantity':
              newState.quantityExamples = [...newState.quantityExamples, text];
              break;
            case 'total':
              newState.totalExamples = [...newState.totalExamples, text];
              break;
          }
          
          // Clear the selected pattern type after adding
          newState.selectedPatternType = null;
          
          return newState;
        });
        
        // Clear the selected text
        setSelectedText('');
      }
    }
  };

  const handleFieldSelect = (field: ParsingField) => {
    setSelectedField(field);
  };

  const createRegexFromSelection = () => {
    if (!selectedText || !selectedEmail || !selectedField) return;
    
    // Get the email body
    const email = invoiceEmails.find(e => e._id === selectedEmail);
    if (!email) return;
    
    // Create a pattern that will match the text plus capture the relevant part
    let pattern = '';
    let groupIndex = 1;
    
    // First, escape regex special characters in the selected text
    const escapedText = selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    if (selectedField === 'orderNumber') {
      // For order numbers, look for numbers after "#" or "ORDER NUMBER:" or similar patterns
      if (/\d+/.test(selectedText)) {
        // If the selection has numbers, extract just the numbers
        const numberMatch = selectedText.match(/(\d+)/);
        if (numberMatch) {
          // Find where the number is within the selected text
          const numberIndex = selectedText.indexOf(numberMatch[1]);
          const beforeNumber = selectedText.substring(0, numberIndex);
          
          // Create pattern that matches the text before number + captures the number
          pattern = `${beforeNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)`;
        } else {
          // Fallback pattern
          pattern = `${escapedText.replace(/(\d+)/, '(\\d+)')}`;
        }
      } else {
        // If no numbers in selection, make it look for numbers after this text
        pattern = `${escapedText}\\s*(#?\\d+)`;
      }
    } else if (['total', 'subtotal', 'shipping', 'tax'].includes(selectedField)) {
      // For monetary values, look for dollar amounts
      if (/\$\s*[\d,.]+/.test(selectedText)) {
        // If selection has dollar sign, capture the amount
        const moneyMatch = selectedText.match(/\$\s*([\d,.]+)/);
        if (moneyMatch) {
          const valueIndex = selectedText.indexOf(moneyMatch[1]);
          const beforeValue = selectedText.substring(0, valueIndex - 1); // -1 for the $ sign
          
          // Create pattern that matches text + $ + captures the number
          pattern = `${beforeValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\$\\s*([\\d,.]+)`;
        } else {
          // Fallback pattern
          pattern = `${escapedText.replace(/(\$\s*[\d,.]+)/, '(\\$\\s*[\\d,.]+)')}`;
        }
      } else {
        // If no $ sign, look for it after this text
        pattern = `${escapedText}\\s*\\$?\\s*([\\d,.]+)`;
      }
    } else if (selectedField === 'discount') {
      // For discounts, look for negative dollar amounts
      if (/\$\s*-[\d,.]+/.test(selectedText) || /-\$\s*[\d,.]+/.test(selectedText)) {
        // If selection has negative dollar value, capture it
        const moneyMatch = selectedText.match(/(-?\$\s*[\d,.]+|-\$\s*[\d,.]+|\$\s*-[\d,.]+)/);
        if (moneyMatch) {
          // Extract just the numeric part without $ or - signs
          pattern = `${escapedText.replace(moneyMatch[0], `(${moneyMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`)}`;
        } else {
          // Fallback
          pattern = `${escapedText.replace(/(-?\$\s*[\d,.]+|-\$\s*[\d,.]+|\$\s*-[\d,.]+)/, '(\\$\\s*-[\\d,.]+)')}`;
        }
      } else {
        // Look for it after this text
        pattern = `${escapedText}\\s*(-\\$\\s*[\\d,.]+|\\$\\s*-[\\d,.]+)`;
      }
    } else {
      // For other fields, just create a basic pattern
      pattern = escapedText;
      groupIndex = 0; // The whole match
    }
    
    console.log(`Created pattern for ${selectedField}: ${pattern}`);
    
    // Save the pattern
    savePattern(pattern, groupIndex);
  };

  const savePattern = async (pattern: string, groupIndex: number) => {
    if (!selectedEmail || !selectedField) return;
    
    const email = invoiceEmails.find(e => e._id === selectedEmail);
    if (!email || !email.supplier?.id) return;
    
    // Construct the email parsing configuration
    const emailParsing = {
      ...email.supplier.emailParsing || {},
      [selectedField]: {
        pattern,
        flags: 'm', // Multiline flag
        groupIndex,
        transform: ['total', 'subtotal', 'shipping', 'tax', 'discount'].includes(selectedField) 
          ? 'parseFloat' 
          : selectedField === 'orderNumber' ? 'parseInt' : 'trim'
      }
    };
    
    try {
      const response = await fetch(`/api/suppliers/${email.supplier.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emailParsing }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update supplier');
      }
      
      // Update the UI
      setInvoiceEmails(emails => 
        emails.map(e => 
          e._id === selectedEmail 
            ? { 
                ...e, 
                supplier: { 
                  ...e.supplier!, 
                  emailParsing 
                } 
              } 
            : e
        )
      );
      
      // Reset selection state
      setSelectedField(null);
      setSelectedText('');
      
      // Exit parsing mode
      setIsParsingMode(false);
      
    } catch (error) {
      console.error('Error saving pattern:', error);
      alert('Failed to save pattern. Please try again.');
    }
  };

  // Handle product pattern action
  const handleProductPatternAction = (action: 'name' | 'quantity' | 'total') => {
    if (!selectedText || !selectedEmail) {
      // If no text selected, just set the pattern type for the next selection
      setProductParsingState(prev => ({
        ...prev,
        selectedPatternType: action
      }));
      return;
    }
    
    // Add the selected text to the appropriate examples list (allow duplicates for different contexts)
    setProductParsingState(prev => {
      const newState = { ...prev };
      
      switch (action) {
        case 'name':
          newState.nameExamples = [...newState.nameExamples, selectedText];
          break;
        case 'quantity':
          newState.quantityExamples = [...newState.quantityExamples, selectedText];
          break;
        case 'total':
          newState.totalExamples = [...newState.totalExamples, selectedText];
          break;
      }
      
      // Clear the selected pattern type
      newState.selectedPatternType = null;
      
      return newState;
    });
    
    // Clear the selected text
    setSelectedText('');
  };

  const removeExample = (type: 'name' | 'quantity' | 'total', index: number) => {
    setProductParsingState(prev => {
      const newState = { ...prev };
      
      switch (type) {
        case 'name':
          newState.nameExamples = newState.nameExamples.filter((_, i) => i !== index);
          break;
        case 'quantity':
          newState.quantityExamples = newState.quantityExamples.filter((_, i) => i !== index);
          break;
        case 'total':
          newState.totalExamples = newState.totalExamples.filter((_, i) => i !== index);
          break;
      }
      
      return newState;
    });
  };

  const generatePatternFromExamples = (examples: string[], type: 'name' | 'quantity' | 'total'): string => {
    if (examples.length === 0) return '';
    
    if (examples.length === 1) {
      // For single example, create a simple pattern
      const escapedText = examples[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      switch (type) {
        case 'name':
          return `(${escapedText})`;
        case 'quantity':
          if (/\d+/.test(examples[0])) {
            const numberMatch = examples[0].match(/(\d+)/);
            if (numberMatch) {
              const numberIndex = examples[0].indexOf(numberMatch[1]);
              const beforeNumber = examples[0].substring(0, numberIndex);
              return `${beforeNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)`;
            }
          }
          return `${escapedText}\\s*(\\d+)`;
        case 'total':
          if (/\$?\d+(\.\d+)?/.test(examples[0])) {
            const priceMatch = examples[0].match(/\$?(\d+(?:\.\d+)?)/);
            if (priceMatch) {
              const priceIndex = examples[0].indexOf(priceMatch[0]);
              const beforePrice = examples[0].substring(0, priceIndex);
              const afterPrice = examples[0].substring(priceIndex + priceMatch[0].length);
              
              // Escape the before and after parts
              const escapedBefore = beforePrice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const escapedAfter = afterPrice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              
              // Handle line breaks and whitespace more intelligently
              const beforeWithWhitespace = escapedBefore.replace(/\s+/g, '\\s*');
              const afterWithWhitespace = escapedAfter.replace(/\s+/g, '\\s*');
              
              return `${beforeWithWhitespace}\\$?(\\d+(?:\\.\\d+)?)${afterWithWhitespace}`;
            }
          }
          return `${escapedText.replace(/\s+/g, '\\s*')}\\s*\\$?(\\d+(?:\\.\\d+)?)`;
      }
    }
    
    // For multiple examples, find common patterns
    switch (type) {
      case 'name':
        // For names, create an alternation pattern
        const escapedNames = examples.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        return `(${escapedNames.join('|')})`;
      
      case 'quantity':
        // Find common prefix/suffix patterns for quantities
        const commonQtyPattern = findCommonPattern(examples, '\\d+');
        return commonQtyPattern || '(\\d+)';
      
      case 'total':
        // Find common prefix/suffix patterns for totals
        const commonTotalPattern = findCommonPattern(examples, '\\d+(?:\\.\\d+)?');
        return commonTotalPattern || '\\$?(\\d+(?:\\.\\d+)?)';
      
      default:
        return '';
    }
  };

  const findCommonPattern = (examples: string[], valuePattern: string): string => {
    if (examples.length < 2) return '';
    
    // Find the longest common prefix and suffix
    let commonPrefix = '';
    let commonSuffix = '';
    
    // Find common prefix
    const firstExample = examples[0];
    for (let i = 0; i < firstExample.length; i++) {
      const char = firstExample[i];
      if (examples.every(example => example[i] === char)) {
        commonPrefix += char;
      } else {
        break;
      }
    }
    
    // Find common suffix
    for (let i = 1; i <= firstExample.length; i++) {
      const char = firstExample[firstExample.length - i];
      if (examples.every(example => example[example.length - i] === char)) {
        commonSuffix = char + commonSuffix;
      } else {
        break;
      }
    }
    
    // Escape special regex characters and handle whitespace intelligently
    const escapedPrefix = commonPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    const escapedSuffix = commonSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    
    return `${escapedPrefix}(${valuePattern})${escapedSuffix}`;
  };

  // Save product patterns to supplier
  const saveProductPatterns = async () => {
    if (!selectedEmail) return;
    
    const email = invoiceEmails.find(e => e._id === selectedEmail);
    if (!email || !email.supplier?.id) return;
    
    const { nameExamples, quantityExamples, totalExamples } = productParsingState;
    const wholesaleDiscount = productParsingState.wholesaleDiscount || 0;
    const quantityMultiple = productParsingState.quantityMultiple || 1;
    
    // We need at least one example for each pattern type
    if (nameExamples.length === 0 || quantityExamples.length === 0 || totalExamples.length === 0) {
      alert('Please provide at least one example for product name, quantity, and total.');
      return;
    }
    
    // Generate patterns from examples
    const namePattern = generatePatternFromExamples(nameExamples, 'name');
    const quantityPattern = generatePatternFromExamples(quantityExamples, 'quantity');
    const totalPattern = generatePatternFromExamples(totalExamples, 'total');
    
    // Construct the email parsing configuration for products
    const emailParsing = {
      ...email.supplier.emailParsing || {},
      products: {
        items: {
          name: {
            pattern: namePattern,
            flags: 'gm', // Global and Multiline flags to match multiple occurrences
            groupIndex: 1,
            transform: 'trim'
          },
          quantity: {
            pattern: quantityPattern,
            flags: 'gm', // Global and Multiline flags to match multiple occurrences
            groupIndex: 1,
            transform: 'parseInt'
          },
          total: {
            pattern: totalPattern,
            flags: 'gm', // Global and Multiline flags to match multiple occurrences
            groupIndex: 1,
            transform: 'parseFloat'
          }
        },
        wholesaleDiscount,
        quantityMultiple,
        // Store the training examples for future reference
        trainingExamples: {
          nameExamples,
          quantityExamples,
          totalExamples
        }
      }
    };
    
    try {
      const response = await fetch(`/api/suppliers/${email.supplier.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emailParsing }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update supplier');
      }
      
      // Update the UI
      setInvoiceEmails(emails => 
        emails.map(e => 
          e._id === selectedEmail 
            ? { 
                ...e, 
                supplier: { 
                  ...e.supplier!, 
                  emailParsing 
                } 
              } 
            : e
        )
      );
      
      // Try to parse products with the new patterns
      const productMatches = extractProductsFromEmail(email.body, emailParsing.products);
      
      // Update parsing results with the products
      if (productMatches) {
        setParsingResults(prev => ({
          ...prev,
          [email._id]: {
            ...prev[email._id],
            products: {
              value: String(productMatches.products.length),
              match: 'Products found',
              products: productMatches.products
            }
          }
        }));
      }
      
      // Reset state
      setProductParsingState({
        nameExamples: [],
        quantityExamples: [],
        totalExamples: []
      });
      setSelectedField(null);
      setSelectedText('');
      
      // Exit parsing mode
      setIsParsingMode(false);
      
    } catch (error) {
      console.error('Error saving product patterns:', error);
      alert('Failed to save product patterns. Please try again.');
    }
  };
  
  // Extract products from an email using parsing patterns
  const extractProductsFromEmail = (emailBody: string, patterns: EmailParsingConfig['products']) => {
    if (!patterns || !patterns.items || !patterns.items.name || !patterns.items.quantity || !patterns.items.total) {
      return null;
    }
    
    try {
      const nameRegex = new RegExp(patterns.items.name.pattern, patterns.items.name.flags || 'g');
      const quantityRegex = new RegExp(patterns.items.quantity.pattern, patterns.items.quantity.flags || 'g');
      const totalRegex = new RegExp(patterns.items.total.pattern, patterns.items.total.flags || 'g');
      
      const nameMatches: string[] = [];
      const quantityMatches: number[] = [];
      const totalMatches: number[] = [];
      
      // Extract matches for each pattern
      let match;
      while ((match = nameRegex.exec(emailBody)) !== null) {
        nameMatches.push(match[1] || match[0]);
      }
      
      while ((match = quantityRegex.exec(emailBody)) !== null) {
        const quantityStr = match[1] || match[0];
        const quantity = parseFloat(quantityStr.replace(/[^\d.-]/g, ''));
        if (!isNaN(quantity)) {
          quantityMatches.push(quantity);
        }
      }
      
      while ((match = totalRegex.exec(emailBody)) !== null) {
        const totalStr = match[1] || match[0];
        const total = parseFloat(totalStr.replace(/[^\d.-]/g, ''));
        if (!isNaN(total)) {
          totalMatches.push(total);
        }
      }
      
      // Check if we have matches for all three patterns
      if (nameMatches.length === 0 || quantityMatches.length === 0 || totalMatches.length === 0) {
        return null;
      }
      
      // Take the minimum length to ensure we have matching sets
      const minLength = Math.min(nameMatches.length, quantityMatches.length, totalMatches.length);
      
      // Get the multipliers / discounts from the patterns
      const costDiscount = patterns.costDiscount ?? patterns.wholesaleDiscount ?? 0;
      const quantityMultiple = patterns.quantityMultiple || 1;
      const products: ParsedProduct[] = [];
      
      for (let i = 0; i < minLength; i++) {
        products.push({
          name: nameMatches[i],
          quantity: quantityMatches[i] * quantityMultiple, // Apply quantity multiple
          total: totalMatches[i],
          // Apply cost discount to each product
          costDiscount: costDiscount
        });
      }
      
      return {
        products,
        costDiscount,
        quantityMultiple
      };
    } catch (error) {
      console.error('Error extracting products from email:', error);
      return null;
    }
  };

  // Add a function to save products to a transaction
  const saveProductsToTransaction = async (emailId: string) => {
    if (!parsingResults[emailId]?.products?.products?.length) {
      alert('No products found to save.');
      return;
    }
    
    // Find the email
    const email = invoiceEmails.find(e => e._id === emailId);
    if (!email) {
      alert('Email not found.');
      return;
    }
    
    try {
      // Prepare the products data with discounts applied
      // The discount has already been applied from the costDiscount during product parsing
      // These products will be saved to MongoDB in the transaction document
      const products = parsingResults[emailId].products.products.map(product => ({
        productId: product.productId, // may be undefined
        name: product.dbName || product.name,
        quantity: product.quantity,
        unitPrice: Number((product.total / product.quantity).toFixed(2)),
        totalPrice: Number((product.total * (1 - (product.costDiscount || 0))).toFixed(2)),
        costDiscount: product.costDiscount || 0
      }));
      
      // Calculate the total after discounts
      const totalAfterDiscounts = products.reduce((sum, p) => sum + p.totalPrice, 0);
      
      // Call API to create a transaction
      // This transaction will be saved to MongoDB with the specified data
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: new Date(email.date).toISOString(),
          amount: totalAfterDiscounts,
          supplier: email.supplier?.name || email.from.split('<')[0].trim(),
          notes: `Invoice from ${email.supplier?.name || 'unknown supplier'}`,
          type: 'expense',
          source: 'email',
          emailId: email.emailId,
          purchaseCategory: 'inventory',
          supplierOrderNumber: parsingResults[email._id]?.orderNumber?.value || '',
          products: products // saved
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create transaction');
      }
      
      const result = await response.json();
      
      // Update the UI to show the email is processed
      setInvoiceEmails(prev => 
        prev.map(e => 
          e._id === emailId
            ? { ...e, status: 'processed', transactionId: result.transaction.id }
            : e
        )
      );
      
      // Show success message
      alert('Products saved to transaction successfully!');
      
    } catch (error) {
      console.error('Error saving products to transaction:', error);
      alert('Failed to save products to transaction. Please try again.');
    }
  };

  // Add a function to handle the cost discount input
  const handleCostDiscountChange = (value: string) => {
    // Convert percentage input to decimal (e.g., 20 -> 0.20)
    const percentage = parseFloat(value);
    if (!isNaN(percentage)) {
      const decimalValue = percentage / 100;
      setProductParsingState(prev => ({
        ...prev,
        wholesaleDiscount: decimalValue
      }));
    }
  };

  // Add a function to handle the quantity multiple input
  const handleQuantityMultipleChange = (value: string) => {
    const multiple = parseFloat(value);
    if (!isNaN(multiple) && multiple > 0) {
      setProductParsingState(prev => ({
        ...prev,
        quantityMultiple: multiple
      }));
    } else {
      setProductParsingState(prev => ({
        ...prev,
        quantityMultiple: 1
      }));
    }
  };

  // NEW: save content bounds to supplier parsing config
  const saveContentBounds = async () => {
    if (!selectedEmail) return;
    const email = invoiceEmails.find(e => e._id === selectedEmail);
    if (!email || !email.supplier?.id) return;

    const emailParsing = {
      ...email.supplier.emailParsing,
      contentBounds: {
        ...(contentBoundsInputs.startPattern
          ? { startPattern: { pattern: contentBoundsInputs.startPattern, flags: 'm', groupIndex: 0 } }
          : {}),
        ...(contentBoundsInputs.endPattern
          ? { endPattern: { pattern: contentBoundsInputs.endPattern, flags: 'm', groupIndex: 0 } }
          : {})
      }
    };

    try {
      const response = await fetch(`/api/suppliers/${email.supplier.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailParsing })
      });

      if (!response.ok) {
        throw new Error('Failed to update supplier');
      }

      // Update local state so UI reflects change
      setInvoiceEmails(prev =>
        prev.map(e =>
          e._id === selectedEmail
            ? { ...e, supplier: { ...e.supplier!, emailParsing } }
            : e
        )
      );

      alert('Content bounds saved!');
    } catch (err) {
      console.error('Error saving content bounds', err);
      alert('Failed to save content bounds. Please try again.');
    }
  };

  // ────────────────────────────────────────────────
  // AI Parsing
  // ────────────────────────────────────────────────
  interface AIParseResultFrontend {
    orderNumber: string | null;
    subtotal: string | null;
    shipping: string | null;
    tax: string | null;
    discount: string | null;
    orderTotal: string | null;
    products: { name: string; quantity: number; lineTotal: string }[];
  }

  const parseWithAI = async (email: InvoiceEmail) => {
    setAiLoadingEmail(email._id);

    try {
      const response = await fetch('/api/ai/parse-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailBody: email.body, supplierId: email.supplier?.id || email.supplierId })
      });

      const json = await response.json();

      if (!response.ok) {
        alert(json?.error || 'AI parsing failed');
        return;
      }

      const data = json.data as AIParseResultFrontend;

      if (!data) {
        alert('No data returned from AI');
        return;
      }

      const results: Record<ParsingField, ParsingResult> = {
        orderNumber: { value: data.orderNumber ?? null, match: null },
        total: { value: data.orderTotal ?? null, match: null },
        subtotal: { value: data.subtotal ?? null, match: null },
        shipping: { value: data.shipping ?? null, match: null },
        tax: { value: data.tax ?? null, match: null },
        discount: { value: data.discount ?? null, match: null },
        products: {
          value: data.products && data.products.length ? String(data.products.length) : null,
          match: null,
          products: (data.products || []).map((p) => ({
            name: p.name,
            quantity: Number(p.quantity) || 0,
            total: parseFloat(p.lineTotal) || 0,
            costDiscount:
              email.supplier?.emailParsing?.products?.costDiscount ??
              email.supplier?.emailParsing?.products?.wholesaleDiscount ??
              0
          }))
        }
      };

      // ───────────────────────────────────────────────
      // Auto-match products to MongoDB products via supplierAliases
      // ───────────────────────────────────────────────
      const supplierIdForMatch = email.supplier?.id || email.supplierId;
      if (supplierIdForMatch && results.products.products && results.products.products.length) {
        await Promise.all(
          results.products.products.map(async (prod, idx) => {
            try {
              const resp = await fetch(
                `/api/products/find-by-alias?supplierId=${supplierIdForMatch}&name=${encodeURIComponent(prod.name)}`
              );
              if (resp.ok) {
                const { product } = await resp.json();
                if (product?._id) {
                  prod.productId = product._id as string;
                  prod.dbName = product.name as string;

                  // preload suggestions so dropdown shows immediately
                  const key = `${email._id}-${idx}`;
                  setProductSuggestions(prev => {
                    const existing = prev[key] || [];
                    if (!existing.find(p => p._id === product._id)) {
                      return { ...prev, [key]: [ { _id: product._id, name: product.name }, ...existing ] };
                    }
                    return prev;
                  });
                }
              }
            } catch (err) {
              console.warn('alias lookup failed', err);
            }
          })
        );
      }

      setParsingResults(prev => ({
        ...prev,
        [email._id]: results
      }));
    } catch (err) {
      console.error('AI parse error:', err);
      alert('Failed to parse with AI');
    } finally {
      setAiLoadingEmail(null);
    }
  };

  const saveAITraining = async (email: InvoiceEmail) => {
    const parsed = parsingResults[email._id]
    if (!parsed) {
      alert('No parsed data to save');
      return;
    }
 
    try {
      // 1. Create / update product aliases based on current mappings
      const productsArray = parsed.products?.products || []
      for (const prod of productsArray) {
        if (prod.productId) {
          await fetch(`/api/products/${prod.productId}/alias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              supplierId: email.supplier?.id || email.supplierId,
              nameInInvoice: prod.name
            })
          })
        }
      }
 
      // 2. Save corrected products as a purchase transaction
      await saveProductsToTransaction(email._id)
 
      // 3. Save training sample for the supplier
      // Build training prompt respecting content bounds if defined
      const buildPrompt = () => {
        const bounds = email.supplier?.emailParsing?.contentBounds
        if (bounds?.startPattern?.pattern && bounds?.endPattern?.pattern) {
          try {
            // Ensure case-insensitive search by adding 'i' if missing
            const normalizeFlags = (orig = '') => orig.includes('i') ? orig : orig + 'i'

            const startRegex = new RegExp(bounds.startPattern.pattern, normalizeFlags(bounds.startPattern.flags))
            const endRegex = new RegExp(bounds.endPattern.pattern, normalizeFlags(bounds.endPattern.flags))

            const startMatch = startRegex.exec(email.body)
            const endMatch = endRegex.exec(email.body)

            if (startMatch && endMatch) {
              const startIdx = startMatch.index
              const endIdx = endMatch.index
              if (endIdx > startIdx) {
                return email.body.slice(startIdx, endIdx).slice(0, 6000)
              }
            }
          } catch {
            console.warn('contentBounds regex error, falling back to full body')
          }
        }
        return email.body.slice(0, 6000)
      }

      await fetch(`/api/suppliers/${email.supplier?.id || email.supplierId}/ai-training`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: buildPrompt(),
          result: parsed
        })
      })
      alert('Training sample saved!');
    } catch (err) {
      console.error('save training error', err)
      alert('Failed to save training data');
    }
  };

  // Helper to update a single parsed product row
  const updateProduct = (
    emailId: string,
    index: number,
    partial: Partial<ParsedProduct>
  ) => {
    setParsingResults(prev => {
      const emailData = prev[emailId]
      if (!emailData || !emailData.products?.products) return prev
      const updated = [...emailData.products.products]
      updated[index] = { ...updated[index], ...partial }
      return {
        ...prev,
        [emailId]: {
          ...emailData,
          products: { ...emailData.products, products: updated }
        }
      }
    })
  }

  // Update the same cost discount on every parsed product for an email
  const updateCostDiscount = (emailId: string, discount: number) => {
    setParsingResults(prev => {
      const emailData = prev[emailId];
      if (!emailData || !emailData.products?.products) return prev;
      const updatedProducts = emailData.products.products.map(p => ({
        ...p,
        costDiscount: discount
      }));
      return {
        ...prev,
        [emailId]: {
          ...emailData,
          products: { ...emailData.products, products: updatedProducts }
        }
      };
    });
  };

  // Combine and sort transactions and invoice emails
  const allItems: ListItem[] = [
    ...transactions.map(t => ({
      type: 'transaction' as const,
      date: t.date,
      data: t
    })),
    ...amexTxns.map(a => ({
      type: 'amex' as const,
      date: a.date,
      data: a
    })),
    ...invoiceEmails.map(e => ({
      type: 'invoice' as const,
      date: e.date,
      data: e
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Filter items based on active filter
  const filteredItems = allItems.filter(item => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'invoices') {
      if (item.type === 'invoice' || item.type === 'amex') return true;
      if (item.type === 'transaction' && (item.data as Transaction).source === 'amex') return true;
      return false;
    }
    if (activeFilter === 'sales') {
      return item.type === 'transaction' && (item.data as Transaction).type === 'sale';
    }
    if (activeFilter === 'expenses') {
      return item.type === 'transaction' && (item.data as Transaction).type === 'expense';
    }
    if (activeFilter === 'training') {
      return item.type === 'transaction' && (item.data as Transaction).type === 'training';
    }
    return true;
  });

  if (isLoading) {
    return <div className="p-4">Loading data...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  // Helper to escape user text for safe regex and collapse whitespace
  const escapeForRegex = (text: string) =>
    text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');

  // Derive start & end patterns from the currently-highlighted selection
  const setBoundsFromSelection = () => {
    if (!selectedText) return;

    const lines = selectedText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const startSnippet = lines[0].slice(0, 120); // safety limit
    const endSnippet = lines[lines.length - 1].slice(0, 120);

    setContentBoundsInputs({
      startPattern: escapeForRegex(startSnippet),
      endPattern: escapeForRegex(endSnippet)
    });
  };

  // NEW: compute trimmed preview for content bounds
  const getBoundsPreview = (email: InvoiceEmail | undefined) => {
    if (!email) return '';
    const { startPattern, endPattern } = contentBoundsInputs;
    if (!startPattern || !endPattern) return '';
    try {
      const normalizeFlags = (orig = '') => orig.includes('i') ? orig : orig + 'i';
      const startRegex = new RegExp(startPattern, normalizeFlags());
      const endRegex = new RegExp(endPattern, normalizeFlags());
      const startMatch = startRegex.exec(email.body);
      const endMatch = endRegex.exec(email.body);
      if (startMatch && endMatch && endMatch.index > startMatch.index) {
        return email.body.slice(startMatch.index, endMatch.index);
      }
    } catch {}
    return '';
  };

  // helper
  const deleteTxn = async (id: string) => {
    if (deletingId) return;
    if (!window.confirm('Delete this transaction?')) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setTransactions(prev => prev.filter(t => t._id !== id));
    } catch {
      alert('Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Transactions & Invoices</h1>
      
      {/* Amex fetch button + menu */}
      <div className="mb-6 relative inline-block">
        <button
          onClick={() => setShowAmexMenu(prev=>!prev)}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200"
        >
          Find Amex Transactions
        </button>
        {showAmexMenu && (
          <div className="absolute z-10 mt-2 w-40 bg-white border border-gray-200 rounded shadow-lg">
            <button
              onClick={async () => {
                setShowAmexMenu(false);
                const currentYear = new Date().getUTCFullYear();
                const yearStart = new Date(Date.UTC(currentYear, 0, 1));
                const daysSinceYearStart = Math.floor((Date.now() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
                try {
                  const res = await fetch(`/api/amex?sinceDays=${daysSinceYearStart}`);
                  const json = await res.json();
                  if(!res.ok || json.error){alert(json.error || 'Fetch failed');return;}
                  const fetched: AmexTransaction[] = json.transactions || [];
                  const existingIds = new Set<string>(transactions.map(t=>t.emailId).filter(Boolean) as string[]);
                  const unique = fetched.filter(f=>!existingIds.has(f.emailId));
                  setAmexTxns(unique);
                  setActiveFilter('invoices');
                }catch{
                  alert('Fetch error');
                }
              }}
              className="block w-full text-left px-4 py-2 text-sm hover:bg-blue-50 border-b border-gray-100"
            >This Year</button>
            {[7,30,60,90].map(days=> (
              <button
                key={days}
                onClick={async () => {
                  setShowAmexMenu(false);
                  try {
                    const res = await fetch(`/api/amex?sinceDays=${days}`);
                    const json = await res.json();
                    if(!res.ok || json.error){alert(json.error || 'Fetch failed');return;}
                    const fetched: AmexTransaction[] = json.transactions || [];
                    const existingIds = new Set<string>(transactions.map(t=>t.emailId).filter(Boolean) as string[]);
                    const unique = fetched.filter(f=>!existingIds.has(f.emailId));
                    setAmexTxns(unique);
                    setActiveFilter('invoices');
                  }catch{
                    alert('Fetch error');
                  }
                }}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-blue-50"
              >Last {days} days</button>
            ))}
          </div>
        )}
      </div>
      
      {/* Date range filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['thisYear', 'lastYear', 'thisMonth', 'all'] as const).map(df => (
          <button
            key={df}
            onClick={() => setDateFilter(df)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              dateFilter === df ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {df === 'thisYear' && 'This Year'}
            {df === 'lastYear' && 'Last Year'}
            {df === 'thisMonth' && 'This Month'}
            {df === 'all' && 'All Time'}
          </button>
        ))}
      </div>
      
      {/* Type filter buttons */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeFilter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All ({allItems.length})
        </button>
        <button
          onClick={() => setActiveFilter('sales')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeFilter === 'sales'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Sales ({transactions.filter(t => t.type === 'sale').length})
        </button>
        <button
          onClick={() => setActiveFilter('expenses')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeFilter === 'expenses'
              ? 'bg-red-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Expenses ({transactions.filter(t => t.type === 'expense').length})
        </button>
        <button
          onClick={() => setActiveFilter('training')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeFilter === 'training'
              ? 'bg-yellow-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Training ({transactions.filter(t => t.type === 'training').length})
        </button>
        <button
          onClick={() => setActiveFilter('invoices')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeFilter === 'invoices'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Amex / Invoice Emails ({invoiceEmails.length + amexTxns.length})
        </button>
      </div>
      
      {/* Add parsing stats information */}
      {parsingStats.totalEmails > 0 && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
          <p className="font-medium">Invoice Email Parsing Stats:</p>
          <div className="flex flex-wrap gap-4 mt-1">
            <span>Total Emails: {parsingStats.totalEmails}</span>
            <span>Emails with Parsed Data: {parsingStats.parsedEmails}</span>
            <span>Total Fields Parsed: {parsingStats.parsedFields}</span>
          </div>
        </div>
      )}
      
      <div className="space-y-4">
        {filteredItems.map((item) => {
          if (item.type === 'transaction') {
            const transaction = item.data as Transaction;
            return (
              <div
                key={transaction._id}
                className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow relative group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-lg font-semibold">
                      {(() => {
                        if (transaction.type === 'training') {
                          return transaction.clientName || transaction.trainingAgency || 'Unknown';
                        }
                        return transaction.merchant || transaction.supplier || transaction.customer || transaction.clientName || transaction.trainingAgency || 'Unknown';
                      })()}
                    </p>
                    <p className="text-sm text-gray-600">
                      {new Date(transaction.date).toLocaleDateString()} • {transaction.type} • {transaction.source}
                    </p>
                    {/* Training specific details */}
                    {transaction.type === 'training' && (
                      <div className="mt-1 space-y-0.5 text-xs text-gray-700">
                        {transaction.dogName && (
                          <div>Dog: <span className="font-medium">{transaction.dogName}</span></div>
                        )}
                        {transaction.trainer && (
                          <div>Trainer: <span className="font-medium">{transaction.trainer}</span></div>
                        )}
                        {/* Compute amounts */}
                        {(() => {
                          const revenue = typeof transaction.revenue === 'number' ? transaction.revenue : transaction.amount;
                          const taxable = !transaction.trainingAgency;
                          const salesTax = typeof transaction.taxAmount === 'number' ? transaction.taxAmount : (taxable ? parseFloat(((revenue * 0.08875) / 1.08875).toFixed(2)) : 0);
                          const sale = revenue - salesTax;
                          return (
                            <div className="flex flex-wrap gap-2 mt-1">
                              <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">Revenue: {formatCurrency(revenue)}</span>
                              {taxable && (
                                <>
                                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700">Sale: {formatCurrency(sale)}</span>
                                  <span className="px-2 py-0.5 rounded bg-pink-50 text-pink-700">Sales&nbsp;Tax: {formatCurrency(salesTax)}</span>
                                </>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {transaction.emailId && (
                      <p className="text-xs text-gray-400 mt-1">Email ID: {transaction.emailId}</p>
                    )}
                  </div>
                  <p className={`text-lg font-mono ${transaction.type === 'expense' ? 'text-red-500' : 'text-green-500'}`}>
                    ${Math.abs(transaction.amount).toFixed(2)}
                  </p>
                </div>

                {/* Delete button */}
                <button
                  onClick={async () => {
                    deleteTxn(transaction._id);
                  }}
                  disabled={deletingId === transaction._id}
                  className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-full opacity-0 group-hover:opacity-100 transition"
                >
                  {deletingId === transaction._id ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            );
          } else if (item.type === 'amex') {
            const a = item.data as AmexTransaction;
            return (
              <div key={a.emailId} className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{a.merchant}</p>
                    <p className="text-sm text-gray-600">{new Date(a.date).toLocaleDateString()} • card • ****{a.cardLast4}</p>
                  </div>
                  <p className="text-lg font-bold">${a.amount.toFixed(2)}</p>
                </div>
                <div className="flex justify-end mt-2">
                  <button
                    className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => {
                      const defaultPayload = {
                        date: new Date(a.date).toISOString(),
                        amount: a.amount,
                        type: 'expense',
                        source: 'amex',
                        supplier: a.merchant,
                        emailId: a.emailId,
                        purchaseCategory: 'inventory',
                        notes: `Amex card ****${a.cardLast4}`
                      };
                      setDraftPayload(JSON.stringify(defaultPayload, null, 2));
                      setPreviewAmex(a);
                    }}
                  >Preview&nbsp;&amp;&nbsp;Save</button>
                </div>
              </div>
            )
          } else {
            const email = item.data as InvoiceEmail;
            const isHtml = email.body.trim().toLowerCase().startsWith('<html');
            const hasParsingResults = parsingResults[email._id];
            
            return (
              <div
                key={email._id}
                className="bg-purple-50 p-4 rounded-lg shadow hover:shadow-md transition-shadow border-l-4 border-purple-500"
              >
                {/* Header - clicking this toggles expansion */}
                <div 
                  className="flex justify-between items-start cursor-pointer"
                  onClick={(e) => toggleEmailBody(email._id, e)}
                >
                  <div>
                    <p className="text-lg font-semibold">
                      {email.supplier?.name || email.from.split('<')[0].trim()}
                    </p>
                    <p className="text-sm text-gray-600">
                      {new Date(email.date).toLocaleDateString()} • Invoice Email • {email.status}
                    </p>
                    <p className="text-sm text-gray-700 mt-1">
                      {email.subject}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Email ID: {email.emailId}</p>
                    
                    {/* Always show key values in the header, even if undefined */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {hasParsingResults && Object.entries(parsingResults[email._id]).map(([field, result]) => 
                        result.value && (
                          <span 
                            key={field}
                            className={`text-sm px-2 py-0.5 rounded ${
                              field === 'orderNumber' ? 'bg-blue-100 text-blue-800' :
                              field === 'total' ? 'bg-purple-100 text-purple-800 font-medium' :
                              field === 'subtotal' ? 'bg-indigo-100 text-indigo-800' :
                              field === 'shipping' || field === 'tax' ? 
                                parseFloat(result.value) > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800' :
                              field === 'discount' ? 'bg-green-100 text-green-800' :
                              field === 'products' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {field === 'orderNumber' ? (
                              <>#${result.value}</>
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
                  <div className="flex items-center">
                    {email.supplier && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            parseWithAI(email);
                          }}
                          disabled={aiLoadingEmail === email._id}
                          className={`mr-3 px-2 py-1 text-xs rounded ${aiLoadingEmail === email._id ? 'bg-teal-100 text-teal-400 cursor-not-allowed' : 'bg-teal-200 text-teal-700 hover:bg-teal-300'}`}
                        >
                          {aiLoadingEmail === email._id ? 'Parsing…' : 'Parse with AI'}
                        </button>

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleParsingMode(email._id);
                          }} 
                          className={`mr-3 px-2 py-1 text-xs rounded ${isParsingMode && selectedEmail === email._id ? 'bg-purple-500 text-white' : 'bg-purple-200 text-purple-700'}`}
                        >
                          {isParsingMode && selectedEmail === email._id ? 'Exit Parsing Mode' : 'Parse Email'}
                        </button>
                        {parsingResults[email._id] && Object.values(parsingResults[email._id]).some(r => r.value) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              saveAITraining(email);
                            }}
                            className="px-2 py-1 text-xs rounded bg-green-200 text-green-700 hover:bg-green-300"
                          >
                            Save as Correct
                          </button>
                        )}
                      </>
                    )}
                    <div className="text-purple-600">
                      {expandedEmails[email._id] ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Display all extracted values when expanded */}
                {expandedEmails[email._id] && hasParsingResults && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-purple-100 flex flex-wrap gap-2 text-sm">
                    {Object.entries(parsingResults[email._id]).map(([field, result]) => 
                      field !== 'products' && result.value && (
                        <div 
                          key={field} 
                          className={`px-3 py-1 rounded-full flex items-center ${getValueColorClass(field as ParsingField, result.value)}`}
                        >
                          <span className="font-medium mr-1">{field}:</span> 
                          <span>
                            {field === 'orderNumber' ? 
                              `#${result.value}` : 
                              ['total', 'subtotal', 'shipping', 'tax'].includes(field) ? 
                                formatCurrency(result.value) : 
                                field === 'discount' ? 
                                  `-${formatCurrency((typeof result.value === 'number' ? String(result.value) : (result.value || '')).replace('-', ''))}` : 
                                  result.value
                            }
                          </span>
                        </div>
                      )
                    )}
                    {/* Display count of parsed products if any */}
                    {(parsingResults[email._id]?.products?.products || []).length > 0 && (
                      <div className="px-3 py-1 rounded-full flex items-center bg-blue-50 text-blue-700">
                        <span className="font-medium mr-1">Products:</span>
                        <span>{(parsingResults[email._id]?.products?.products || []).length} items</span>
                      </div>
                    )}
                    {!Object.values(parsingResults[email._id] || {}).some(r => r?.value) && 
                     !(parsingResults[email._id]?.products?.products || []).length && (
                      <p className="text-gray-500 text-xs italic">No data extracted yet</p>
                    )}
                  </div>
                )}

                {/* Products Management UI */}
                {expandedEmails[email._id] && 
                  hasParsingResults && 
                  (parsingResults[email._id]?.products?.products || []).length > 0 && (
                    <div className="mt-3 p-3 bg-white rounded-lg border border-purple-100">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-3 gap-3">
                        <h3 className="font-medium">Parsed Products</h3>

                        <div className="flex items-center gap-2">
                          <label className="text-sm">Cost Discount&nbsp;(%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={((parsingResults[email._id]?.products?.products?.[0]?.costDiscount || 0) * 100).toString()}
                            onChange={(e) => {
                              const perc = parseFloat(e.target.value);
                              const dec = !isNaN(perc) ? perc / 100 : 0;

                              // Update all parsed products locally
                              updateCostDiscount(email._id, dec);
                            }}
                            className="w-20 border px-2 py-1 rounded text-right text-sm"
                          />
                        </div>

                        <Button
                          onClick={() => saveProductsToTransaction(email._id)}
                          disabled={!email || !(parsingResults[email._id]?.products?.products || []).length}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                        >
                          Save Products to Transaction
                        </Button>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-3 py-2 text-left">Product</th>
                              <th className="px-3 py-2 text-right">Quantity</th>
                              <th className="px-3 py-2 text-right">Total</th>
                              <th className="px-3 py-2 text-right">Adjusted Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsingResults[email._id].products?.products?.map((product, index) => {
                              // adjusted total computed inline
                              const adjustedTotal = product.total * (1 - (product.costDiscount || 0));
                              
                              return (
                                <tr key={index} className="border-b">
                                  {/* Name + mapping */}
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1">
                                      <span>{product.name}</span>
                                      <span className="text-xs text-gray-400">→</span>
                                      {(() => {
                                        const key = `${email._id}-${index}`;
                                        const suggestions = productSuggestions[key] || [];
                                        const merged = product.productId && product.dbName && !suggestions.find(p => p._id === product.productId)
                                          ? [{ _id: product.productId, name: product.dbName }, ...suggestions]
                                          : suggestions;
                                        return (
                                          <select
                                            value={product.productId || ''}
                                            onClick={() => {
                                              if (!productSuggestions[key]) {
                                                fetchProductSuggestions(product.name, email._id, index);
                                              }
                                            }}
                                            onChange={e => {
                                              const selId = e.target.value;
                                              const selName = merged.find(p => p._id === selId)?.name || '';
                                              updateProduct(email._id, index, { productId: selId || undefined, dbName: selName });
                                            }}
                                            className="border rounded px-1 text-xs"
                                          >
                                            <option value="">Select...</option>
                                            {merged.map(p => (
                                              <option key={p._id} value={p._id}>{p.name}</option>
                                            ))}
                                          </select>
                                        );
                                      })()}
                                    </div>
                                  </td>
                                  {/* Quantity editable */}
                                  <td className="px-3 py-2 text-right">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={product.quantity}
                                      onChange={e => updateProduct(email._id, index, { quantity: parseFloat(e.target.value) || 0 })}
                                      className="w-20 border px-1 rounded text-right"
                                    />
                                  </td>
                                  {/* Total editable */}
                                  <td className="px-3 py-2 text-right">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={product.total}
                                      onChange={e => updateProduct(email._id, index, { total: parseFloat(e.target.value) || 0 })}
                                      className="w-24 border px-1 rounded text-right"
                                    />
                                  </td>
                                  {/* Adjusted total */}
                                  <td className="px-3 py-2 text-right">
                                    {formatCurrency(adjustedTotal.toString())}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50 font-medium">
                              <td className="px-3 py-2" colSpan={2}>Total</td>
                              <td className="px-3 py-2 text-right">
                                {formatCurrency(
                                  (parsingResults[email._id].products?.products || [])
                                    .reduce((sum, p) => sum + p.total, 0)
                                    .toString()
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {formatCurrency(
                                  (parsingResults[email._id].products?.products || [])
                                    .reduce((sum, p) => sum + (p.total * (1 - (p.costDiscount || 0))), 0)
                                    .toString()
                                )}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                {/* Parsing UI */}
                {expandedEmails[email._id] && isParsingMode && selectedEmail === email._id && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-purple-300">
                    <p className="text-sm font-medium mb-2">Select information to extract:</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(['orderNumber', 'total', 'subtotal', 'shipping', 'tax', 'discount', 'products'] as ParsingField[]).map(field => (
                        <button
                          key={field}
                          onClick={() => handleFieldSelect(field)}
                          className={`px-3 py-1 text-sm rounded-full transition-colors ${
                            selectedField === field 
                              ? 'bg-purple-600 text-white' 
                              : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                          }`}
                        >
                          {field}
                        </button>
                      ))}
                    </div>
                    
                    {selectedField === 'products' ? (
                      <div className="border border-purple-200 rounded-lg p-3 mb-3">
                        <p className="text-sm font-medium mb-2">Product Parsing:</p>
                        <p className="text-xs text-gray-600 mb-3">
                          For products, you&apos;ll need to define patterns for each part.
                          First select the text for a product name or section, then click the appropriate button.
                        </p>
                        
                        <div className="flex flex-wrap gap-2 mb-3">
                          <button 
                            className={`px-3 py-1 text-sm rounded-full ${
                              productParsingState.nameExamples.length > 0 ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            } transition-colors`}
                            onClick={() => handleProductPatternAction('name')}
                          >
                            Product Name Pattern
                            {productParsingState.nameExamples.length > 0 && ` (${productParsingState.nameExamples.length})`}
                          </button>
                          <button 
                            className={`px-3 py-1 text-sm rounded-full ${
                              productParsingState.quantityExamples.length > 0 ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
                            } transition-colors`}
                            onClick={() => handleProductPatternAction('quantity')}
                          >
                            Quantity Pattern
                            {productParsingState.quantityExamples.length > 0 && ` (${productParsingState.quantityExamples.length})`}
                          </button>
                          <button 
                            className={`px-3 py-1 text-sm rounded-full ${
                              productParsingState.totalExamples.length > 0 ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            } transition-colors`}
                            onClick={() => handleProductPatternAction('total')}
                          >
                            Total Pattern
                            {productParsingState.totalExamples.length > 0 && ` (${productParsingState.totalExamples.length})`}
                          </button>
                        </div>

                        {/* Display current examples */}
                        {(productParsingState.nameExamples.length > 0 || productParsingState.quantityExamples.length > 0 || productParsingState.totalExamples.length > 0) && (
                          <div className="mb-4 space-y-3">
                            {/* Name Examples */}
                            {productParsingState.nameExamples.length > 0 && (
                              <div>
                                <p className="text-sm font-medium text-blue-700 mb-2">Product Name Examples:</p>
                                <div className="flex flex-wrap gap-2">
                                  {productParsingState.nameExamples.map((example, index) => (
                                    <div key={index} className="bg-blue-50 border border-blue-200 rounded px-2 py-1 text-sm flex items-center gap-2">
                                      <span className="font-mono text-blue-800">{example}</span>
                                      <button
                                        onClick={() => removeExample('name', index)}
                                        className="text-blue-500 hover:text-blue-700 text-xs"
                                        title="Remove example"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Quantity Examples */}
                            {productParsingState.quantityExamples.length > 0 && (
                              <div>
                                <p className="text-sm font-medium text-green-700 mb-2">Quantity Examples:</p>
                                <div className="flex flex-wrap gap-2">
                                  {productParsingState.quantityExamples.map((example, index) => (
                                    <div key={index} className="bg-green-50 border border-green-200 rounded px-2 py-1 text-sm flex items-center gap-2">
                                      <span className="font-mono text-green-800">{example}</span>
                                      <button
                                        onClick={() => removeExample('quantity', index)}
                                        className="text-green-500 hover:text-green-700 text-xs"
                                        title="Remove example"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Total Examples */}
                            {productParsingState.totalExamples.length > 0 && (
                              <div>
                                <p className="text-sm font-medium text-amber-700 mb-2">Total Examples:</p>
                                <div className="flex flex-wrap gap-2">
                                  {productParsingState.totalExamples.map((example, index) => (
                                    <div key={index} className="bg-amber-50 border border-amber-200 rounded px-2 py-1 text-sm flex items-center gap-2">
                                      <span className="font-mono text-amber-800">{example}</span>
                                      <button
                                        onClick={() => removeExample('total', index)}
                                        className="text-amber-500 hover:text-amber-700 text-xs"
                                        title="Remove example"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Instructions */}
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-800">
                            <strong>Instructions:</strong> 
                            {productParsingState.selectedPatternType ? (
                              <>Now highlight text in the email below to add a <strong>{productParsingState.selectedPatternType}</strong> example.</>
                            ) : (
                              <>Click a pattern button above, then highlight text in the email below, or highlight text first then click a pattern button.</>
                            )}
                          </p>
                        </div>
                        
                        {/* Add cost discount input */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Cost Discount Percentage
                          </label>
                          <div className="flex items-center">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={productParsingState.wholesaleDiscount ? (productParsingState.wholesaleDiscount * 100) : ''}
                              onChange={(e) => handleCostDiscountChange(e.target.value)}
                              placeholder="Enter %"
                              className="w-24 px-3 py-2 border border-gray-300 rounded-md mr-2"
                            />
                            <span className="text-gray-600">%</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Enter the cost discount percentage (e.g., 20 for 20%)
                          </p>
                        </div>
                        
                        {/* Add quantity multiple input */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Quantity Multiple
                          </label>
                          <div className="flex items-center">
                            <input
                              type="number"
                              min="1"
                              value={productParsingState.quantityMultiple || ''}
                              onChange={(e) => handleQuantityMultipleChange(e.target.value)}
                              placeholder="Enter quantity multiple"
                              className="w-24 px-3 py-2 border border-gray-300 rounded-md mr-2"
                            />
                            <span className="text-gray-600">x</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Enter the quantity multiple (e.g., 2 for double quantity)
                          </p>
                        </div>
                        
                        <div className="mt-3">
                          {selectedText && (
                            <div className="p-2 bg-gray-50 rounded border text-sm mb-3">
                              <p className="font-medium mb-1">Selected Text:</p>
                              <p className="font-mono text-xs break-all">{selectedText}</p>
                            </div>
                          )}
                          
                          {/* Show existing patterns if they exist */}
                          {email.supplier?.emailParsing?.products && (
                            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <p className="text-sm font-medium text-yellow-800 mb-2">Current Patterns:</p>
                              <div className="text-xs space-y-1">
                                <div><strong>Name:</strong> <code className="bg-yellow-100 px-1 rounded">{email.supplier.emailParsing.products.items.name.pattern}</code></div>
                                <div><strong>Quantity:</strong> <code className="bg-yellow-100 px-1 rounded">{email.supplier.emailParsing.products.items.quantity.pattern}</code></div>
                                <div><strong>Total:</strong> <code className="bg-yellow-100 px-1 rounded">{email.supplier.emailParsing.products.items.total.pattern}</code></div>
                              </div>
                              <div className="mt-3 pt-3 border-t border-yellow-300">
                                <p className="text-sm font-medium text-yellow-800 mb-2">Current Settings:</p>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-xs font-medium text-yellow-700 mb-1">
                                      Cost Discount
                                    </label>
                                    <div className="flex items-center">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="1"
                                        value={email.supplier.emailParsing.products.costDiscount ? (email.supplier.emailParsing.products.costDiscount * 100) : ''}
                                        onChange={(e) => {
                                          const percentage = parseFloat(e.target.value);
                                          const decimalValue = !isNaN(percentage) ? percentage / 100 : 0;
                                          
                                          // Update the email supplier data immediately for UI feedback
                                          setInvoiceEmails(emails => 
                                            emails.map(emailItem => {
                                              if (emailItem._id === selectedEmail && emailItem.supplier?.emailParsing?.products) {
                                                const updated: InvoiceEmail = {
                                                  ...emailItem,
                                                  supplier: {
                                                    ...emailItem.supplier,
                                                    emailParsing: {
                                                      ...emailItem.supplier.emailParsing,
                                                      products: {
                                                        ...emailItem.supplier.emailParsing.products,
                                                        costDiscount: decimalValue
                                                      }
                                                    }
                                                  }
                                                };
                                                return updated;
                                              }
                                              return emailItem;
                                            })
                                          );
                                        }}
                                        placeholder="0"
                                        className="w-16 px-2 py-1 text-xs border border-yellow-300 rounded mr-1"
                                      />
                                      <span className="text-xs text-yellow-700">%</span>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-yellow-700 mb-1">
                                      Quantity Multiple
                                    </label>
                                    <div className="flex items-center">
                                      <input
                                        type="number"
                                        min="1"
                                        step="0.1"
                                        value={email.supplier.emailParsing.products.quantityMultiple || ''}
                                        onChange={(e) => {
                                          const multiple = parseFloat(e.target.value);
                                          const validMultiple = !isNaN(multiple) && multiple > 0 ? multiple : 1;
                                          
                                          // Update the email supplier data immediately for UI feedback
                                          setInvoiceEmails(emails => 
                                            emails.map(emailItem => {
                                              if (emailItem._id === selectedEmail && emailItem.supplier?.emailParsing?.products) {
                                                const updated: InvoiceEmail = {
                                                  ...emailItem,
                                                  supplier: {
                                                    ...emailItem.supplier,
                                                    emailParsing: {
                                                      ...emailItem.supplier.emailParsing,
                                                      products: {
                                                        ...emailItem.supplier.emailParsing.products,
                                                        quantityMultiple: validMultiple
                                                      }
                                                    }
                                                  }
                                                };
                                                return updated;
                                              }
                                              return emailItem;
                                            })
                                          );
                                        }}
                                        placeholder="1"
                                        className="w-16 px-2 py-1 text-xs border border-yellow-300 rounded mr-1"
                                      />
                                      <span className="text-xs text-yellow-700">x</span>
                                    </div>
                                  </div>
                                </div>
                                <button 
                                  onClick={async () => {
                                    if (!email.supplier?.emailParsing?.products) return;
                                    
                                    try {
                                      const response = await fetch(`/api/suppliers/${email.supplier.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ 
                                          emailParsing: email.supplier.emailParsing 
                                        }),
                                      });
                                      
                                      if (response.ok) {
                                        alert('Settings updated successfully!');
                                      } else {
                                        alert('Failed to update settings. Please try again.');
                                      }
                                    } catch (error) {
                                      console.error('Error updating settings:', error);
                                      alert('Failed to update settings. Please try again.');
                                    }
                                  }}
                                  className="w-full mt-3 bg-yellow-600 hover:bg-yellow-700 text-white py-1 px-3 rounded text-xs transition-colors"
                                >
                                  Update Settings Only
                                </button>
                              </div>
                              <p className="text-xs text-yellow-700 mt-2">Add new examples above to retrain these patterns.</p>
                            </div>
                          )}
                          
                          {/* Save button for new patterns */}
                          {(productParsingState.nameExamples.length > 0 && productParsingState.quantityExamples.length > 0 && productParsingState.totalExamples.length > 0) && (
                            <button 
                              onClick={saveProductPatterns}
                              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded transition-colors mb-2"
                            >
                              {email.supplier?.emailParsing?.products ? 'Update Product Patterns' : 'Save Product Patterns'}
                            </button>
                          )}
                          {/* -------------------------------------------------- */}
                          {/* Content Bounds Editor (now shown under header) */}
                          {/* -------------------------------------------------- */}

                          {expandedEmails[email._id] && (
                            <div className="mt-4 flex flex-col md:flex-row gap-4">
                              {/* Editor */}
                              <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-200 max-w-xl flex-shrink-0">
                               <h4 className="text-sm font-medium mb-2 text-indigo-800">Content Bounds</h4>
                               <div className="mb-2 flex flex-col gap-2">
                                 <input
                                   type="text"
                                   value={contentBoundsInputs.startPattern}
                                   onChange={e => setContentBoundsInputs({ ...contentBoundsInputs, startPattern: e.target.value })}
                                   placeholder="Start regex (optional)"
                                   className="w-full border px-2 py-1 text-xs rounded"
                                 />
                                 <input
                                   type="text"
                                   value={contentBoundsInputs.endPattern}
                                   onChange={e => setContentBoundsInputs({ ...contentBoundsInputs, endPattern: e.target.value })}
                                   placeholder="End regex (optional)"
                                   className="w-full border px-2 py-1 text-xs rounded"
                                 />
                               </div>
                               {/* actions */}
                               <div className="flex flex-wrap gap-2 mb-2">
                                 <button
                                   onClick={setBoundsFromSelection}
                                   disabled={!selectedText}
                                   className={`text-xs px-3 py-1 rounded ${selectedText ? 'bg-indigo-200 text-indigo-700 hover:bg-indigo-300' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                                 >
                                   Use Highlight as Bounds
                                 </button>
                                 <button
                                   onClick={saveContentBounds}
                                   className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1 rounded"
                                 >
                                   Save Content Bounds
                                 </button>
                               </div>
                               {selectedText && (
                                 <p className="text-[10px] text-gray-500 italic">Using first & last line of highlighted text to build start/end regex.</p>
                               )}
                             </div>
                              {/* Preview */}
                              <div className="flex-1 border rounded bg-gray-50 p-2 overflow-y-auto text-xs whitespace-pre-wrap">
                                {(() => {
                                  const preview = getBoundsPreview(email);
                                  return preview ? preview : <em className="text-gray-400">No match with current patterns</em>;
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      selectedText && selectedField && (
                        <div className="space-y-3">
                          <div className="p-2 bg-gray-50 rounded border text-sm">
                            <p className="font-medium mb-1">Selected Text:</p>
                            <p className="font-mono text-xs break-all">{selectedText}</p>
                          </div>
                          
                          <button
                            onClick={createRegexFromSelection}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded transition-colors"
                          >
                            Create Pattern from Selection
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
                
                {/* Email body */}
                {expandedEmails[email._id] && (
                  <div 
                    className="email-body mt-4 p-4 bg-white rounded border border-purple-200 overflow-x-auto" 
                    onMouseUp={handleTextSelection}
                    onClick={(e) => e.stopPropagation()} // Prevent clicks in body from toggling expansion
                  >
                    {isHtml ? (
                      <div className="prose max-w-none">
                        {/* For HTML emails, just use dangerouslySetInnerHTML for now */}
                        {/* In a production app, you might want to parse and highlight HTML too */}
                        <div dangerouslySetInnerHTML={{ __html: email.body }} />
                        
                        {/* Add a parsed values summary at the top for HTML emails */}
                        {hasParsingResults && Object.values(parsingResults[email._id]).some(r => r.value) && (
                          <div className="mb-4 p-3 bg-gray-50 border rounded-md">
                            <p className="font-medium text-sm mb-2">Extracted Values:</p>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(parsingResults[email._id]).map(([field, result]) => 
                                result.value && (
                                  <div 
                                    key={field} 
                                    className={`px-2 py-1 rounded text-xs ${getValueColorClass(field as ParsingField, result.value)}`}
                                  >
                                    <span className="font-medium mr-1">{field}:</span> 
                                    <span>
                                      {field === 'orderNumber' ? 
                                        `#${result.value}` : 
                                        ['total', 'subtotal', 'shipping', 'tax'].includes(field) ? 
                                          formatCurrency(result.value) : 
                                          field === 'discount' ? 
                                            `-${formatCurrency((typeof result.value === 'number' ? String(result.value) : (result.value || '')).replace('-', ''))}` : 
                                            result.value
                                      }
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <pre className="font-mono text-sm whitespace-pre-wrap">
                        {hasParsingResults ? (
                          <>
                            {renderEmailBodyWithHighlights(email.body, parsingResults[email._id])}
                          </>
                        ) : (
                          email.body
                        )}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          }
        })}
      </div>
      {previewAmex && (
        <Dialog open={!!previewAmex} onOpenChange={(o)=>{ if(!o) setPreviewAmex(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Save Amex Transaction</DialogTitle>
            </DialogHeader>
            <textarea
              className="w-full h-48 font-mono text-xs border rounded bg-gray-50 p-2"
              value={draftPayload}
              onChange={e=>setDraftPayload(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300"
                onClick={() => setPreviewAmex(null)}
              >Cancel</button>
              <button
                className="px-3 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                disabled={savingAmex}
                onClick={async () => {
                  if(!previewAmex) return;
                  setSavingAmex(true);
                  let payload;
                  try {
                    payload = JSON.parse(draftPayload);
                  } catch {
                    alert('Invalid JSON');
                    setSavingAmex(false);
                    return;
                  }
                  try{
                    const res = await fetch('/api/transactions',{
                      method:'POST',
                      headers:{'Content-Type':'application/json'},
                      body:JSON.stringify(payload)
                    });
                    const json = await res.json();
                    if(!res.ok){ alert(json?.error || 'Save failed'); setSavingAmex(false); return; }
                    // add to transactions list
                    if(json.transaction){
                      setTransactions(prev=>[json.transaction, ...prev]);
                    }
                    setAmexTxns(prev=>prev.filter(x=>x.emailId!==previewAmex.emailId));
                    setPreviewAmex(null);
                  }catch{
                    alert('Save error');
                  }finally{
                    setSavingAmex(false);
                  }
                }}
              >{savingAmex? 'Saving…':'Commit'}</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
} 