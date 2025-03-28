'use client'

import { useState, useEffect, ReactNode } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TransactionsList } from "@/components/transactions-list"
import { useTransactions } from "@/lib/hooks/useTransactions"
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Loader2, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Transaction as DbTransaction } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"

// Type for our internal transaction representation
interface InternalTransaction {
  _id: string
  id: string
  source: string
  date: string
  amount: number
  [key: string]: unknown
}

// Type for Excel transactions
interface ExcelTransaction {
  Date: string
  'Transaction ID': string
  Location: string
  Customer: string
  Client: string
  'Dog training agency': string
  "Dog's name": string
  Supplier: string
  'Supplier order #': string
  'Gmail message ID': string
  'Shopify order #': string
  Products: string
  'Itemized wholesale spend': string
  State: string
  'Payment method': string
  'Starting cash balance': number
  'Ending cash balance': number
  'Wholesale cost': number
  'Software cost': number
  'Ads cost': number
  'Equipment cost': number
  'Miscellaneous expense': number
  'Print media expense': number
  'Shipping cost': number
  'Transit cost': number
  'Dry ice cost': number
  'Packaging cost': number
  'Space rental cost': number
  Fee: number
  'Sales tax': number
  'Pawsability rent': number
  'Other cost': number
  'Paid to Madeline': number
  'Paid to Geoff': number
  'Actually sent to Madeline': number
  'Withheld for Madeline income tax': number
  'Actually sent to Geoff': number
  'Withheld for Geoff income tax': number
  'Investment from Madeline': number
  'Investment from Geoff': number
  Revenue: number
  Tip: number
  Discount: number
  Sale: number
  'Estimated wholesale cost': number
  'Estimated profit': number
  'Estimated profit %': number
  'Estimated itemized profit': string
  Note: string
}

// Type for our processed transactions with additional properties
interface ProcessedTransaction extends ExcelTransaction {
  _id?: string
  exists: boolean
  matchType: 'exact' | 'probable' | 'none'
  mongoDocument?: InternalTransaction | null
  [key: string]: unknown
}

// Type for cell selection
interface CellSelection {
  rowIndex: number;
  field: string;
}

// Type for MongoDB product
interface MongoProduct {
  _id: string;
  id: string;
  name: string;
  price: number;
  lastPurchasePrice?: number;
  [key: string]: unknown;
}

// Type definition for table field
interface TableField {
  id: string;
  label: string;
  dataField: string;
  shopifyField?: string;
  altField?: string;
  isHidden?: boolean;
}

interface ExistingTransactions {
  transactions: Array<{
    id?: string;
    type?: string;
    supplier?: string;
    supplierOrderNumber?: string;
    amount?: number;
    [key: string]: unknown;
  }>;
}

type TransactionRecord = {
  id?: string;
  type?: string;
  supplier?: string;
  supplierOrderNumber?: string;
  amount?: number;
  excelId?: string;
  [key: string]: unknown;
};

// Define types for the formatted products
interface FormattedProduct {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  productId?: string;
  originalName?: string; // Add original name field
}

export default function SalesPage() {
  const [file, setFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [processedTransactions, setProcessedTransactions] = useState<ProcessedTransaction[]>([])
  const [selectedTransactions, setSelectedTransactions] = useState<Map<number, boolean>>(new Map())
  const [activeTab, setActiveTab] = useState<string>('upload')
  const [fieldSelectionOpen, setFieldSelectionOpen] = useState(false)
  const [selectedCells] = useState<CellSelection[]>([])
  const [transactionToCommit, setTransactionToCommit] = useState<ProcessedTransaction | null>(null)
  const { refreshTransactions } = useTransactions()
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({
    id: true,
    source: true,
    date: true,
    amount: true,
    taxAmount: true,
    preTaxAmount: true,
    customer: true,
    paymentMethod: true,
    description: true,
    type: true,
    notes: true,
    status: true,
    tip: true, 
    discount: true,
    products: true,
    excelId: true,  // Add the excelId field to selected fields
    supplier: true, // Ensure supplier is included for purchase transactions
    supplierOrderNumber: true // Ensure supplier order number is included for purchase transactions
  });
  const [mongoProducts, setMongoProducts] = useState<MongoProduct[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_productSearchTerm, setProductSearchTerm] = useState<string>('');
  const [suggestedProducts, setSuggestedProducts] = useState<MongoProduct[]>([]);
  const [manualMatches, setManualMatches] = useState<Record<string, string>>({});
  const [forceUpdate, setForceUpdate] = useState(0);
  const forceRerender = (): void => setForceUpdate(prev => prev + 1);
  const [, setCommitFieldsPreviewState] = useState<{ id: string; label: string; value: ReactNode; originalData?: string }[]>([]);
  const [transactionToSubmit, setTransactionToSubmit] = useState<Record<string, unknown> | null>(null);
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  
  // Product validation tracking for bulk commit
  const [transactionsWithUnmatchedProducts, setTransactionsWithUnmatchedProducts] = useState<Map<number, string[]>>(new Map());
  const [showProductMatchDialog, setShowProductMatchDialog] = useState(false);
  const [currentUnmatchedProduct, setCurrentUnmatchedProduct] = useState<{transactionIndex: number; productName: string} | null>(null);
  
  // List of selectable fields in the table with their display mapping
  const tableFields: TableField[] = [
    { id: "id", label: "ID", dataField: "Transaction ID", shopifyField: "Shopify order #" },
    { id: "date", label: "Date", dataField: "Date" },
    { id: "transactionType", label: "Type", dataField: "_computed" }, // Special computed field
    { id: "revenue", label: "Revenue", dataField: "Revenue" },
    { id: "wholesaleCost", label: "Wholesale Cost", dataField: "Wholesale cost" },
    { id: "supplierOrderNumber", label: "Supplier Order #", dataField: "Supplier order #" },
    { id: "expenseTypeAmount", label: "Expense Type & Amount", dataField: "_computed" }, // Special computed field for expense
    { id: "description", label: "Products", dataField: "Products" },
    // Hidden fields - not displayed in the main table but available for filtering/reference
    { id: "paymentMethod", label: "Payment", dataField: "Payment method", isHidden: true },
    { id: "customer", label: "Customer", dataField: "Customer", altField: "Client", isHidden: true },
    { id: "client", label: "Client", dataField: "Client", isHidden: true },
    { id: "taxAmount", label: "Sales Tax", dataField: "Sales tax", isHidden: true },
    { id: "tip", label: "Tip", dataField: "Tip", isHidden: true },
    { id: "preTaxAmount", label: "Sale", dataField: "Sale", isHidden: true },
    // You can add more fields here as needed
  ];
  
  // Utility function to calculate similarity score between two strings
  const calculateSimilarityScore = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    let score = 0;
    
    // 1. Exact match gets highest score
    if (s1 === s2) {
      return 100;
    } 
    
    // 2. Check if one is contained within the other
    if (s1.includes(s2)) {
      // s2 is fully contained in s1
      // Score based on how much of s1 is matched
      score += 75 * (s2.length / s1.length);
    } else if (s2.includes(s1)) {
      // s1 is fully contained in s2
      // Score based on how much of s2 is matched
      score += 60 * (s1.length / s2.length);
    }
    
    // 3. Check for common tokens (words)
    const tokens1 = s1.split(/\s+/);
    const tokens2 = s2.split(/\s+/);
    
    // Count matching tokens
    const matchingTokens = tokens1.filter(token => 
      tokens2.includes(token)
    ).length;
    
    // Add score based on percentage of matching tokens
    if (tokens1.length > 0 && tokens2.length > 0) {
      const tokenMatchPercentage = matchingTokens / Math.max(tokens1.length, tokens2.length);
      score += 50 * tokenMatchPercentage;
    }
    
    // 4. Bonus for shorter length difference
    const lengthDifference = Math.abs(s1.length - s2.length);
    const lengthScore = 20 * (1 - (lengthDifference / Math.max(s1.length, s2.length)));
    score += lengthScore;
    
    // 5. Penalty for "bulk" in MongoDB product name (str1)
    // This will de-prioritize bulk products in matches
    if (s1.includes('bulk')) {
      // Apply a significant penalty to bulk products
      score *= 0.5; // Reduce score by 50%
    }
    
    return score;
  };
  
  // CRITICAL: Add an effect to ensure the tab switches when transactions are loaded
  useEffect(() => {
    console.log("useEffect processed transactions:", processedTransactions.length)
    if (processedTransactions.length > 0) {
      // If we have processed transactions, switch to review tab
      console.log("Auto-switching to review tab due to transactions")
      setActiveTab('review')
    }
  }, [processedTransactions.length]) // Only depend on the length to avoid infinite loops
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0]
      console.log("File selected:", selectedFile.name, "Size:", selectedFile.size)
      
      // Clear any previous transactions
      setProcessedTransactions([])
      
      setIsUploading(true)
      setUploadProgress(0)
      
      try {
        // Simulate progress for better UX
        const progressSimulation = setInterval(() => {
          setUploadProgress(prev => {
            const newProgress = prev + (100 - prev) * 0.1
            return Math.min(newProgress, 95) // Cap at 95% until actually complete
          })
        }, 200)
        
        // For large files, reading can take time
        await new Promise(resolve => setTimeout(resolve, 100)) // Small delay for UI to update
        
        setFile(selectedFile)
        
        // Complete progress
        clearInterval(progressSimulation)
        setUploadProgress(100)
        
        // Reset the upload state after showing 100% briefly
        setTimeout(() => {
          setIsUploading(false)
          setUploadProgress(0)
          
          // Directly process the file here instead of relying on a callback
          console.log("Starting file processing...")
          processFile(selectedFile).then(() => {
            console.log("File processing completed, tab should now switch to review")
          })
        }, 500)
      } catch (error) {
        console.error('Error uploading file:', error)
        alert('Failed to upload the file. Please try again.')
        setIsUploading(false)
        setUploadProgress(0)
      }
    }
  }
  
  const processFile = async (fileToProcess = file) => {
    if (!fileToProcess) {
      console.error("No file to process")
      return
    }
    
    console.log("Processing file:", fileToProcess.name)
    setIsProcessing(true)
    
    try {
      // Read the file data
      const data = await fileToProcess.arrayBuffer()
      console.log("File read successfully, size:", data.byteLength, "bytes")
      
      // Parse Excel workbook with raw cell values
      const workbook = XLSX.read(data, { type: 'array' })
      console.log("Excel workbook parsed successfully, sheets:", workbook.SheetNames)
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error("No sheets found in the Excel file")
      }
      
      // Get the first worksheet
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      console.log("Using first worksheet:", sheetName)
      
      // Parse to JSON with headers
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: true,              // Return unformatted values
        defval: '',             // Default value for empty cells
        blankrows: false,       // Skip blank rows
        header: 1,              // Generate an array of arrays
      }) as (string | number | boolean | null)[][]
      
      if (jsonData.length < 2) { // Need at least header row and one data row
        throw new Error("No data found in the Excel file or missing headers")
      }
      
      // First row is headers
      const headers = jsonData[0] as string[]
      console.log("Found headers:", headers)
      
      // Create objects from rows
      const data_rows = jsonData.slice(1).map(row => {
        const obj: Record<string, string | number | boolean | null | undefined> = {}
        headers.forEach((header, i) => {
          if (header && i < row.length) {
            obj[header] = row[i]
          }
        })
        return obj
      })
      
      // Helper function to check if a row has sufficient data to be considered useful
      const hasEnoughData = (row: Record<string, unknown>): boolean => {
        // Count non-empty fields (exclude empty strings, null, undefined)
        const nonEmptyFields = Object.entries(row).filter(([, value]) => {
          if (value === null || value === undefined) return false;
          if (typeof value === 'string' && value.trim() === '') return false;
          if (typeof value === 'number' && value === 0) return false;
          return true;
        }).length;
        
        // Consider a row with only a date or very few fields to be "mostly empty"
        // Require at least 4 non-empty fields to include the row
        const minRequiredFields = 4;
        
        console.log(`Row ${row['Transaction ID'] || 'unknown'} has ${nonEmptyFields} non-empty fields`);
        return nonEmptyFields >= minRequiredFields;
      };
      
      // Filter out rows with insufficient data
      const filtered_rows = data_rows.filter(hasEnoughData);
      console.log(`Filtered from ${data_rows.length} to ${filtered_rows.length} rows with sufficient data`);
      
      console.log("Parsed rows:", filtered_rows.length)
      
      // Fetch all existing transactions to check for duplicates
      const response = await fetch('/api/transactions/minimal-list')
      if (!response.ok) {
        console.warn("Failed to fetch existing transactions, will not check for duplicates")
      }
      
      // Get the list of existing transaction IDs
      const existingTransactions = response.ok ? await response.json() : { transactions: [] }
      
      // Ensure transactions is an array even if API returns unexpected data
      if (!existingTransactions || !Array.isArray(existingTransactions.transactions)) {
        console.warn("API returned invalid transaction data, using empty array for duplication checking")
        existingTransactions.transactions = []
      }
      
      console.log(`Fetched ${existingTransactions.transactions.length} existing transactions for duplication checking`)
      
      // Log transactions with excelId for debugging
      const transactionsWithExcelId = existingTransactions.transactions.filter((t: ExistingTransactions['transactions'][0]) => t.excelId);
      console.log(`Found ${transactionsWithExcelId.length} transactions with excelId field:`, 
        transactionsWithExcelId.slice(0, 5).map((t: ExistingTransactions['transactions'][0]) => ({ 
          _id: t._id, 
          id: t.id, 
          excelId: t.excelId,
          paymentMethod: t.paymentMethod
        })));
      
      // Create processed transactions
      const processed: ProcessedTransaction[] = filtered_rows.map(row => {
        // Handle date
        let transactionDate: Date | null = new Date()
        
        if (row['Date']) {
          try {
            // If it's an Excel date number (stored as days since 1900-01-01)
            if (typeof row['Date'] === 'number') {
              // Excel date serial number to JS Date
              // Excel dates are days since 1900-01-01, but with special handling
              const excelEpoch = new Date(1899, 11, 30); // Excel epoch is 1900-01-00 (December 30, 1899)
              transactionDate = new Date(excelEpoch.getTime() + row['Date'] * 24 * 60 * 60 * 1000);
            } 
            // Handle date strings in various formats
            else if (typeof row['Date'] === 'string') {
              // Try different date parsing approaches
              const dateStr = row['Date'].trim();
              
              // Try parsing as MM/DD/YYYY
              if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                  const month = parseInt(parts[0]) - 1; // JS months are 0-indexed
                  const day = parseInt(parts[1]);
                  const year = parseInt(parts[2]);
                  transactionDate = new Date(year, month, day);
                  console.log("Parsed date string (MM/DD/YYYY):", dateStr, "->", transactionDate.toISOString());
                }
              } 
              // Try ISO format (YYYY-MM-DD)
              else if (dateStr.includes('-')) {
                transactionDate = new Date(dateStr);
                console.log("Parsed ISO date string:", dateStr, "->", transactionDate.toISOString());
              }
              // Fallback to generic date parsing
              else {
                transactionDate = new Date(dateStr);
                console.log("Parsed generic date string:", dateStr, "->", transactionDate.toISOString());
              }
            }
            
            // Validate the date - if invalid, log and default to null
            if (isNaN(transactionDate.getTime())) {
              console.warn("Invalid date detected:", row['Date'], "- using null");
              transactionDate = null;
            }
          } catch (e) {
            console.error("Error parsing date:", row['Date'], e);
            transactionDate = null;
          }
        } else {
          console.warn("No date field found in row");
          transactionDate = null;
        }
        
        // Check if this transaction already exists in MongoDB
        let exists = false
        let matchType: 'exact' | 'probable' | 'none' = 'none'
        let mongoDocument = null
        
        if (row['Transaction ID']) {
          // First and most important: Check if the Transaction ID matches any excelId field in MongoDB
          // This should catch all Excel-imported transactions regardless of payment method or transaction type
          mongoDocument = existingTransactions.transactions.find(
            (t: TransactionRecord) => t && t.excelId && t.excelId === row['Transaction ID']
          )
          
          if (mongoDocument) {
            console.log(`Found exact transaction match by excelId for: ${row['Transaction ID']}`)
            matchType = 'exact'
            exists = true
          } else {
            // If no excelId match, check for exact id match
            mongoDocument = existingTransactions.transactions.find(
              (t: TransactionRecord) => t && t.id && t.id === row['Transaction ID']
            )
            
            // Check for Square transaction format difference (MongoDB: "square_ABC123", Excel: "ABC123")
            if (!mongoDocument) {
              mongoDocument = existingTransactions.transactions.find(
                (t: TransactionRecord) => {
                  // Skip if t or t.id is undefined
                  if (!t || !t.id) return false;
                  
                  // Check for either pattern
                  return t.id === `square_${row['Transaction ID']}` || 
                         (t.id.startsWith('square_') && t.id.substring(7) === row['Transaction ID']);
                }
              )
              
              if (mongoDocument) {
                matchType = 'exact'
              }
            } else {
              console.log(`Found exact transaction match for ID: ${row['Transaction ID']}`)
              matchType = 'exact'
            }
            
            if (mongoDocument) {
              exists = true
            }
          }
        }
        
        // For purchases, also check by supplier and order number
        if (!exists && row['Supplier'] && row['Supplier order #']) {
          const expenseMatch = existingTransactions.transactions.find(
            (t: TransactionRecord) => {
              if (!t || t.type !== 'purchase') return false;
              
              const supplierMatches = t.supplier === row.Supplier;
              const orderNumberMatches = t.supplierOrderNumber === row['Supplier order #'];
              
              // Consider it a match if both supplier and order number match
              return supplierMatches && orderNumberMatches;
            }
          );
          
          if (expenseMatch) {
            mongoDocument = expenseMatch;
            matchType = 'exact';
            exists = true;
            console.log(`Found purchase match by supplier and order number for: ${row.Supplier} / ${row['Supplier order #']}`);
          }
        }
        
        // Create a processed transaction with minimum required fields
        const processedTransaction = {
          ...row as Record<string, unknown>,
          Date: transactionDate ? transactionDate.toISOString() : new Date().toISOString(),
          'Transaction ID': String(row['Transaction ID'] || `manual_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`),
          Sale: Number(row['Sale'] || 0),
          'Payment method': String(row['Payment method'] || 'Unknown'),
          exists,
          matchType,
          mongoDocument
        } as ProcessedTransaction;
        
        return processedTransaction
      })
      
      console.log("Created processed transactions:", processed.length, 
        "Existing:", processed.filter(t => t.exists).length,
        "New:", processed.filter(t => !t.exists).length)
      
      // Directly update state with transactions
      setProcessedTransactions(processed)
      
      return processed
    } catch (error) {
      console.error("Error processing file:", error)
      alert(`Error processing file: ${error instanceof Error ? error.message : String(error)}`)
      return []
    } finally {
      setIsProcessing(false)
      console.log("File processing completed")
      forceRerender()
    }
  }
  
  const toggleTransactionSelection = (index: number) => {
    const newSelection = new Map(selectedTransactions)
    const isSelected = !newSelection.get(index)
    newSelection.set(index, isSelected)
    setSelectedTransactions(newSelection)
    
    // If the transaction is being selected (not deselected), check for unmatched products
    if (isSelected && index >= 0 && index < processedTransactions.length) {
      validateTransactionProducts(index);
    } else if (!isSelected) {
      // If deselected, remove from unmatched products tracking
      const updatedUnmatched = new Map(transactionsWithUnmatchedProducts);
      updatedUnmatched.delete(index);
      setTransactionsWithUnmatchedProducts(updatedUnmatched);
    }
  }
  
  // Function to validate products in a transaction and track unmatched ones
  const validateTransactionProducts = async (index: number) => {
    const transaction = processedTransactions[index];
    if (!transaction) return;
    
    // Skip validation for transactions that already exist in MongoDB
    if (transaction.exists) return;
    
    // Make sure products are loaded first
    if (mongoProducts.length === 0) {
      await fetchProducts();
    }
    
    // Check if the transaction has products that need matching
    const unmatchedProducts = await findUnmatchedProducts(transaction);
    
    if (unmatchedProducts.length > 0) {
      // Update the map with unmatched products for this transaction
      const updatedUnmatched = new Map(transactionsWithUnmatchedProducts);
      updatedUnmatched.set(index, unmatchedProducts);
      setTransactionsWithUnmatchedProducts(updatedUnmatched);
      
      // Show notification about unmatched products
      toast.warning(`Transaction has ${unmatchedProducts.length} unmatched products that may need attention`);
    } else {
      // No unmatched products, remove from tracking if present
      if (transactionsWithUnmatchedProducts.has(index)) {
        const updatedUnmatched = new Map(transactionsWithUnmatchedProducts);
        updatedUnmatched.delete(index);
        setTransactionsWithUnmatchedProducts(updatedUnmatched);
      }
    }
  };
  
  // Function to show the commit preview dialog
  const showCommitPreview = async (rowIndex: number) => {
    if (rowIndex < 0 || rowIndex >= processedTransactions.length) {
      console.warn('Invalid transaction index:', rowIndex);
      return;
    }
    
    const transaction = processedTransactions[rowIndex];
    setTransactionToCommit(transaction);
    
    // Prepare the transaction for preview
    const preparedTransaction = await prepareTransactionForImport(transaction);
    setTransactionToSubmit(preparedTransaction);
    
    // Prepare fields for preview
    const fieldsPreview = getFieldsPreview(transaction);
    setCommitFieldsPreviewState(fieldsPreview);
    
    // Show the dialog
    setShowCommitDialog(true);
  };
  
  // Update the final commit function
  const handleCommitSingle = async (index: number) => {
    if (index < 0 || index >= processedTransactions.length) {
      console.warn('Invalid transaction index:', index);
      return;
    }
    
    await showCommitPreview(index);
  };
  
  // Function to handle committing multiple transactions
  const handleCommitWithSelectedFields = async () => {
    try {
      setIsCommitting(true);
      
      // Convert selected transactions Set to array
      const selectedIndices = Array.from(selectedTransactions.entries())
        .filter(([, selected]) => selected === true)
        .map(([index]) => index);
      
      // Prepare each selected transaction
      const transactionsToCommit = await Promise.all(
        selectedIndices.map(async (index) => {
          const transaction = processedTransactions[index];
          return prepareTransactionForImport(transaction, selectedFields);
        })
      );
      
      // Commit all transactions
      const results = await Promise.all(
        transactionsToCommit.map(async (transaction) => {
          try {
            await commitTransaction(transaction as unknown as ProcessedTransaction);
            return { success: true, transaction };
          } catch (error) {
            return { success: false, transaction, error };
          }
        })
      );
      
      // Handle results
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      if (successful.length > 0) {
        toast.success(`Successfully imported ${successful.length} transactions`);
      }
      
      if (failed.length > 0) {
        toast.error(`Failed to import ${failed.length} transactions`);
        console.error('Failed transactions:', failed);
      }
      
      // Clear selections and refresh
      setSelectedTransactions(new Map());
      setSelectedFields({});
      refreshTransactions();
    } catch (error) {
      console.error('Error committing transactions:', error);
      toast.error('Failed to commit transactions');
    } finally {
      setIsCommitting(false);
    }
  };
  
  // Function for direct bulk commit without field selection dialog
  const handleDirectBulkCommit = async () => {
    try {
      const selectedCount = getSelectedCount();
      if (selectedCount === 0) {
        toast.error('Please select at least one transaction to import');
        return;
      }
      
      // Check if there are any unmatched products
      if (transactionsWithUnmatchedProducts.size > 0) {
        // Count total unmatched products
        let totalUnmatched = 0;
        transactionsWithUnmatchedProducts.forEach(products => {
          totalUnmatched += products.length;
        });
        
        // Show a warning and offer to match them
        toast.warning(`${totalUnmatched} products need matching before committing. Click the "Match Products" button in the toolbar.`);
        
        // Start the product matching flow
        processNextUnmatchedProduct();
        return;
      }
      
      setIsCommitting(true);
      
      // Convert selected transactions Set to array
      const selectedIndices = Array.from(selectedTransactions.entries())
        .filter(([, selected]) => selected === true)
        .map(([index]) => index);
      
      // Get only the transactions that aren't already committed
      const uncommittedIndices = selectedIndices.filter(index => 
        !processedTransactions[index].exists
      );
      
      if (uncommittedIndices.length === 0) {
        toast.info('All selected transactions have already been committed');
        setIsCommitting(false);
        return;
      }
      
      toast.info(`Processing ${uncommittedIndices.length} transactions...`);
      
      // Use default fields for all transactions
      const defaultFields = {
        id: true,
        source: true,
        date: true,
        amount: true,
        taxAmount: true,
        preTaxAmount: true,
        customer: true,
        paymentMethod: true,
        description: true,
        type: true,
        notes: true,
        status: true,
        tip: true, 
        discount: true,
        products: true,
        excelId: true,
        supplier: true,
        supplierOrderNumber: true
      };
      
      // Prepare each selected transaction with default fields
      const transactionsToCommit = await Promise.all(
        uncommittedIndices.map(async (index) => {
          const transaction = processedTransactions[index];
          return prepareTransactionForImport(transaction, defaultFields);
        })
      );
      
      // Save transactions to MongoDB
      const response = await fetch('/api/transactions/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactions: transactionsToCommit }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to commit transactions');
      }
      
      const result = await response.json();
      
      // Handle results
      if (result.success) {
        toast.success(`Successfully imported ${result.importedCount} transactions`);
        
        // Update the status of committed transactions to show they now exist in MongoDB
        const updatedTransactions = [...processedTransactions];
        uncommittedIndices.forEach(index => {
          updatedTransactions[index] = {
            ...updatedTransactions[index],
            exists: true,
            matchType: 'exact' // Mark as exact match since it's now in MongoDB
          };
        });
        setProcessedTransactions(updatedTransactions);
        
        // Clear selections and refresh
        setSelectedTransactions(new Map());
        refreshTransactions();
      } else {
        toast.error(`Failed to import transactions: ${result.error}`);
      }
    } catch (error) {
      console.error('Error committing transactions:', error);
      toast.error('Failed to commit transactions');
    } finally {
      setIsCommitting(false);
    }
  };
  
  // Helper function to parse product JSON from Excel
  const parseProductsJson = (productsString: string | null | undefined): Record<string, unknown> => {
    if (!productsString) return {};
    
    try {
      // Try parsing as JSON
      const trimmed = (productsString || '').trim();
      if (!trimmed) return {};
      
      // Replace single quotes with double quotes if needed
      const jsonReady = trimmed.replace(/'/g, '"');
      
      // Parse the JSON
      const productsObj = JSON.parse(jsonReady);
      
      // Check if we're dealing with the detailed format (with name, count, spend) or simple format
      // Detailed format would have objects as values with name, count, spend properties
      const isDetailedFormat = Object.values(productsObj).some(value => 
        typeof value === 'object' && value !== null && 'name' in (value as object)
      );
      
      if (isDetailedFormat) {
        console.log('📊 Detected detailed product format with name, count, spend');
        return productsObj;
      } else {
        console.log('📊 Detected simple product format (name: quantity)');
        return productsObj;
      }
    } catch (error) {
      console.warn('Error parsing products JSON:', error);
      return {};
    }
  };
  
  // Function to find product matches
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  const findProductMatch = async (productName: string): Promise<MongoProduct | null> => {
    try {
      // Search for products with smart mapping suggestions
      const response = await fetch(`/api/products/search?term=${encodeURIComponent(productName)}`);
      if (!response.ok) {
        throw new Error('Failed to search products');
      }
      
      const data = await response.json();
      if (!data.products || data.products.length === 0) {
        return null;
      }
      
      // Use the highest confidence match if available
      const bestMatch = data.products[0];
      if (bestMatch.confidence >= 60) {
        return bestMatch;
      }
      
      // If no high confidence match, check for exact name match
      const exactMatch = data.products.find((p: MongoProduct) => 
        p.name.toLowerCase().trim() === productName.toLowerCase().trim()
      );
      if (exactMatch) {
        return exactMatch;
      }
      
      return null;
    } catch (error) {
      console.error('Error finding product match:', error);
      return null;
    }
  };
  
  // Function to handle product search
  const handleProductSearch = async (term: string) => {
    if (!term || term.length < 2) {
      setSuggestedProducts([]);
      return;
    }
    
    setIsLoadingProducts(true);
    try {
      const response = await fetch(`/api/products/search?term=${encodeURIComponent(term)}`);
      if (!response.ok) {
        throw new Error('Failed to search products');
      }
      const data = await response.json();
      
      // The API returns { success: true, products: [...] } structure
      if (data.success && Array.isArray(data.products)) {
        setSuggestedProducts(data.products);
      } else {
        setSuggestedProducts([]);
        console.error('Unexpected response format:', data);
      }
    } catch (error) {
      console.error('Error searching products:', error);
      toast.error('Failed to search products');
      setSuggestedProducts([]);
    } finally {
      setIsLoadingProducts(false);
    }
  };
  
  // Helper function to determine if a transaction is an expense based on specific fields
  const isExpenseTransaction = (transaction: ProcessedTransaction): boolean => {
    // Signs that something is an expense rather than a sale:
    // 1. Revenue is 0
    // 2. "Wholesale cost" is a number and is greater than zero
    // 3. "Supplier order #" has a value
    // 4. "Supplier" has a value
    // 5. Any expense field has a value greater than zero
    
    const hasZeroRevenue = !transaction.Revenue || Number(transaction.Revenue) === 0;
    const hasWholesaleCost = typeof transaction['Wholesale cost'] === 'number' && Number(transaction['Wholesale cost']) > 0;
    const hasSupplierOrderNumber = !!transaction['Supplier order #'];
    const hasSupplier = !!transaction.Supplier;
    
    // Check all potential expense fields
    const expenseFields = [
      'Software cost',
      'Ads cost',
      'Equipment cost',
      'Miscellaneous expense',
      'Print media expense',
      'Shipping cost',
      'Transit cost',
      'Dry ice cost',
      'Packaging cost',
      'Space rental cost',
      'Pawsability rent',
      'Other cost'
    ];
    
    // Check if any expense field has a value greater than zero
    const hasAnyExpenseValue = expenseFields.some(field => {
      const value = transaction[field];
      return typeof value === 'number' && value > 0;
    });
    
    // Log detection for debugging
    console.log('🔍 Expense detection:', {
      transactionId: transaction['Transaction ID'],
      hasZeroRevenue,
      hasWholesaleCost,
      hasSupplierOrderNumber,
      hasSupplier,
      hasAnyExpenseValue,
      // Mark as expense if criteria are met
      isExpense: hasZeroRevenue && (hasWholesaleCost || (hasSupplierOrderNumber && hasSupplier) || hasAnyExpenseValue)
    });
    
    // Consider it an expense if:
    // 1. It has zero revenue AND
    // 2. It either:
    //    a. Has wholesale cost, OR
    //    b. Has both supplier order number and supplier info, OR
    //    c. Has any expense field with a value
    return hasZeroRevenue && (hasWholesaleCost || (hasSupplierOrderNumber && hasSupplier) || hasAnyExpenseValue);
  };
  
  // Helper function to prepare transaction for import with selected fields only
  const prepareTransactionForImport = async (transaction: ProcessedTransaction, fields: Record<string, boolean> = selectedFields) => {
    // Create a new object with only the selected fields
    const prepared: Record<string, unknown> = {};
    const isExpense = isExpenseTransaction(transaction);
    
    // Always set the source to excel for transactions imported from Excel
    prepared.source = "excel";
    
    // Set primary fields that are common for all transactions
    // Do not set the 'id' field for Excel transactions as requested
    if (fields.date) prepared.date = transaction.Date || new Date().toISOString();
    if (fields.notes) prepared.notes = transaction.Notes || '';
    
    // Always set excelId for all Excel transactions (both sales and purchases)
    if (fields.excelId) prepared.excelId = transaction['Transaction ID'] || '';
    
    // Set transaction type based on isExpense flag
    if (fields.type) {
      // Check if this is a training transaction first (has Client field)
      if (transaction.Client) {
        prepared.type = 'training';
        // Set training-specific fields
        prepared.trainer = 'Madeline Pape'; // Default trainer
        prepared.clientName = transaction.Client;
        if (transaction["Dog's name"]) prepared.dogName = transaction["Dog's name"];
        // Add Dog training agency field
        if (transaction["Dog training agency"]) prepared.trainingAgency = transaction["Dog training agency"];
        prepared.description = 'Dog training session';
        
        // Set payment method
        if (fields.paymentMethod) {
          prepared.paymentMethod = transaction['Payment method'] || 'Unknown';
        }
        
        // Set amount and tax details
        if (fields.amount) {
          // Set revenue as the amount
          if (transaction.Revenue !== undefined && transaction.Revenue !== null) {
            prepared.amount = Number(transaction.Revenue);
            prepared.revenue = Number(transaction.Revenue);
          }
        }
        
        // Handle tax calculations
        if (fields.taxAmount && transaction['Sales tax']) {
          prepared.taxAmount = Number(transaction['Sales tax']);
          // Calculate pre-tax amount
          if (prepared.amount) {
            prepared.preTaxAmount = Number(prepared.amount) - Number(prepared.taxAmount);
          }
          prepared.isTaxable = Number(transaction['Sales tax']) > 0;
        } else {
          prepared.isTaxable = false;
          // If we have amount but no tax, then preTaxAmount equals amount
          if (prepared.amount) {
            prepared.preTaxAmount = Number(prepared.amount);
            prepared.taxAmount = 0;
          }
        }
        
        // Set status to completed by default
        prepared.status = 'completed';
        
        // Set customer field for compatibility with existing model
        prepared.customer = transaction.Client;
      } else {
        // Not a training transaction, use the expense detection
        prepared.type = isExpense ? 'purchase' : 'sale';
      }
    }
    
    // Log the transaction for debugging
    console.log("Preparing transaction:", transaction);
    
    // For expense transactions, process supplier info and amount differently
    if (isExpense && prepared.type !== 'training') {
      // Handle expense-specific fields
      if (fields.supplier) prepared.supplier = transaction.Supplier || '';
      if (fields.supplierOrderNumber) prepared.supplierOrderNumber = transaction['Supplier order #'] || '';
      
      // For expenses, look for an amount in order of priority
      if (fields.amount) {
        // Use the same list of expense fields as in other parts of the code
        const expenseFields = [
          { field: 'Wholesale cost', label: 'Wholesale', category: 'inventory' },
          { field: 'Software cost', label: 'Software', category: 'software' },
          { field: 'Ads cost', label: 'Ads', category: 'advertising' },
          { field: 'Equipment cost', label: 'Equipment', category: 'equipment' },
          { field: 'Miscellaneous expense', label: 'Misc', category: 'other' },
          { field: 'Print media expense', label: 'Print Media', category: 'advertising' },
          { field: 'Shipping cost', label: 'Shipping', category: 'shipping' },
          { field: 'Transit cost', label: 'Transit', category: 'transit' },
          { field: 'Dry ice cost', label: 'Dry Ice', category: 'supplies' },
          { field: 'Packaging cost', label: 'Packaging', category: 'supplies' },
          { field: 'Space rental cost', label: 'Space Rental', category: 'rent' },
          { field: 'Pawsability rent', label: 'Pawsability Rent', category: 'rent' },
          { field: 'Other cost', label: 'Other', category: 'other' }
        ];
        
        // Find the first expense field with a value
        for (const expense of expenseFields) {
          const value = transaction[expense.field as keyof ProcessedTransaction];
          if (typeof value === 'number' && value > 0) {
            prepared.amount = value;
            
            // Store the expense type and suggested category
            prepared.expenseType = expense.field;
            prepared.expenseLabel = expense.label;
            prepared.purchaseCategory = expense.category;
            
            console.log(`Using "${expense.field}" as amount (${prepared.amount})`);
            break;
          }
        }
        
        // If no amount was found in any column, set to 0 or handle as needed
        if (prepared.amount === undefined) {
          console.warn('No cost found in any expense column, setting amount to 0');
          prepared.amount = 0;
        }
      }
      
      // Process products for expense if available
      if (fields.products && (transaction.Products || transaction['Itemized wholesale spend'])) {
        try {
          // Check if we have the detailed "Itemized wholesale spend" format first
          let productsObj = {};
          let isDetailedFormat = false;
          
          if (transaction['Itemized wholesale spend']) {
            productsObj = parseProductsJson(transaction['Itemized wholesale spend']);
            isDetailedFormat = Object.values(productsObj).some(value => 
              typeof value === 'object' && value !== null && 'name' in (value as object)
            );
          }
          
          // If no detailed format found, try regular Products
          if (!isDetailedFormat && transaction.Products) {
            productsObj = parseProductsJson(transaction.Products);
          }
          
          if (productsObj && Object.keys(productsObj).length > 0) {
            const formattedProducts: FormattedProduct[] = [];
            
            for (const [productName, productData] of Object.entries(productsObj)) {
              let numericQuantity = 0;
              let productSpend = 0;
              let productNameToUse = productName;
              
              // Extract data based on format (simple or detailed)
              if (typeof productData === 'object' && productData !== null && ('count' in productData || 'qty' in productData)) {
                // Detailed format with name, count/qty, spend
                const detailedData = productData as {name?: string; count?: string | number; qty?: string | number; spend?: string | number};
                // Use count if available, otherwise try qty as fallback
                if ('count' in detailedData) {
                  numericQuantity = typeof detailedData.count === 'string' ? parseFloat(detailedData.count) : Number(detailedData.count);
                } else if ('qty' in detailedData) {
                  numericQuantity = typeof detailedData.qty === 'string' ? parseFloat(detailedData.qty) : Number(detailedData.qty);
                }
                productSpend = typeof detailedData.spend === 'string' ? parseFloat(detailedData.spend as string) : Number(detailedData.spend || 0);
                productNameToUse = detailedData.name || productName;
              } else {
                // Simple format with just quantities
                numericQuantity = typeof productData === 'string' ? parseFloat(productData) : Number(productData);
              }
              
              // First check for manual match
              const manualMatchId = manualMatches[productNameToUse];
              let matchedProduct = null;
              
              if (manualMatchId && manualMatchId !== 'override') {
                // Find the product in MongoDB products
                matchedProduct = mongoProducts.find(p => p._id === manualMatchId || p.id === manualMatchId) ?? null;
              } else if (manualMatchId !== 'override') {
                // Try to find potential matches with similarity scoring
                const possibleMatches = mongoProducts
                  .map(p => ({
                    product: p,
                    score: calculateSimilarityScore(p.name, productNameToUse)
                  }))
                  .filter(item => item.score > 20) // Only consider products with a reasonable match score
                  .sort((a, b) => b.score - a.score); // Sort by score (highest first)
                
                // If we have a good candidate (score >= 40), select it initially
                if (possibleMatches.length > 0 && possibleMatches[0].score >= 40) {
                  matchedProduct = possibleMatches[0].product;
                }
              }
              
              if (matchedProduct) {
                // For purchases, use lastPurchasePrice if available instead of price
                const unitPrice = Number(matchedProduct.lastPurchasePrice) || 0;
                
                // Use the actual spend if available from detailed format, otherwise calculate
                const totalPrice = productSpend > 0 ? productSpend : unitPrice * numericQuantity;
                
                formattedProducts.push({
                  name: matchedProduct.name,
                  quantity: numericQuantity,
                  unitPrice: unitPrice,
                  totalPrice: totalPrice,
                  productId: matchedProduct._id,
                  originalName: productNameToUse !== matchedProduct.name ? productNameToUse : undefined
                });
              } else {
                // If no match, add with original name
                // Use the actual spend if available from detailed format
                formattedProducts.push({
                  name: productNameToUse,
                  quantity: numericQuantity,
                  unitPrice: productSpend > 0 ? productSpend / numericQuantity : 0,
                  totalPrice: productSpend > 0 ? productSpend : 0,
                  originalName: productNameToUse
                });
              }
            }
            
            prepared.products = formattedProducts;
          }
        } catch (error) {
          console.error("Error processing products for expense:", error);
        }
      }
    }
    // For sales transactions, process customer info and revenue/tax differently
    else if (prepared.type !== 'training') {
      // Handle sale-specific fields
      if (fields.customer) prepared.customer = transaction.Customer || transaction.Client || '';
      if (fields.taxAmount && transaction['Sales tax']) prepared.taxAmount = Number(transaction['Sales tax']);
      
      // For sales, amount should be the Revenue
      if (fields.amount && transaction.Revenue) {
        prepared.amount = Number(transaction.Revenue);
      }
      
      // For Excel imports, use the Sale column for preTaxAmount
      if (fields.preTaxAmount && transaction.Sale) {
        prepared.preTaxAmount = Number(transaction.Sale);
      }
      
      // Add tip and discount if they exist
      if (fields.tip && transaction.Tip) prepared.tip = Number(transaction.Tip);
      if (fields.discount && transaction.Discount) prepared.discount = Number(transaction.Discount);
      
      // Handle payment method
      if (fields.paymentMethod) prepared.paymentMethod = transaction['Payment method'] || '';
      
      // Process products if available
      if (fields.products && transaction.Products) {
        try {
          // Get products from JSON
          const productsObj = parseProductsJson(transaction.Products);
          
          if (productsObj && Object.keys(productsObj).length > 0) {
            const formattedProducts: FormattedProduct[] = [];
            
            for (const [productName, quantity] of Object.entries(productsObj)) {
              const numericQuantity = typeof quantity === 'string' ? parseFloat(quantity) : Number(quantity);
              
              // First check for manual match
              const manualMatchId = manualMatches[productName];
              let matchedProduct = null;
              
              if (manualMatchId && manualMatchId !== 'override') {
                // Find the product in MongoDB products
                matchedProduct = mongoProducts.find(p => p._id === manualMatchId || p.id === manualMatchId) ?? null;
                console.log(`Using manual match for "${productName}": ${matchedProduct?.name || 'Not found'}`);
              } else {
                // Try automatic matching with the same logic used in the preview dialog
                // First try exact match
                const normalizedName = productName.toLowerCase().trim();
                matchedProduct = mongoProducts.find(p => 
                  p.name.toLowerCase().trim() === normalizedName
                ) ?? null;
                
                // If no exact match, try similarity scoring
                if (!matchedProduct) {
                  const scoredMatches = mongoProducts
                    .map(p => {
                      const score = calculateSimilarityScore(p.name, productName);
                      return { product: p, score };
                    })
                    .filter(item => item.score > 20)
                    .sort((a, b) => b.score - a.score);
                  
                  if (scoredMatches.length > 0 && scoredMatches[0].score >= 40) {
                    matchedProduct = scoredMatches[0].product;
                    console.log(`Found automatic match for "${productName}": ${matchedProduct.name} (score: ${scoredMatches[0].score.toFixed(2)})`);
                  }
                }
              }
              
              if (matchedProduct) {
                // For sales, use price instead of price
                const unitPrice = Number(matchedProduct.price) || 0;
                
                formattedProducts.push({
                  name: matchedProduct.name,
                  quantity: numericQuantity,
                  unitPrice: unitPrice,
                  totalPrice: unitPrice * numericQuantity,
                  productId: matchedProduct._id,
                  originalName: productName !== matchedProduct.name ? productName : undefined
                });
              } else {
                // If no match, add with original name
                formattedProducts.push({
                  name: productName,
                  quantity: numericQuantity,
                  unitPrice: 0,
                  totalPrice: 0,
                  originalName: productName
                });
              }
            }
            
            prepared.products = formattedProducts;
          }
        } catch (error) {
          console.error("Error processing products for sale:", error);
        }
      }
    }
    // Special handling for training transactions
    else {
      // Training transaction specific fields
      
      // For training, amount should be the Revenue
      if (fields.amount && transaction.Revenue) {
        prepared.amount = Number(transaction.Revenue);
      }
      
      // For Excel imports, use the Sale column for preTaxAmount
      if (fields.preTaxAmount && transaction.Sale) {
        prepared.preTaxAmount = Number(transaction.Sale);
      }
      
      // Set tax amount if available
      if (fields.taxAmount && transaction['Sales tax']) {
        prepared.taxAmount = Number(transaction['Sales tax']);
      }
      
      // Handle payment method
      if (fields.paymentMethod) {
        prepared.paymentMethod = transaction['Payment method'] || '';
      }
      
      // Set status to completed by default
      prepared.status = 'completed';
      
      // Use customer field for compatibility with existing transaction model
      prepared.customer = transaction.Client;
    }
    
    return prepared;
  };
  
  // Group fields by category for better organization in the dialog
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  const fieldGroups = {
    "Primary Information": [
      { id: "id", label: "Transaction ID" },
      { id: "source", label: "Source" },
      { id: "date", label: "Date" },
      { id: "amount", label: "Amount" },
      { id: "taxAmount", label: "Tax Amount" },
      { id: "preTaxAmount", label: "Pre-tax Amount" },
      { id: "customer", label: "Customer" },
      { id: "paymentMethod", label: "Payment Method" },
      { id: "products", label: "Products" },
      { id: "type", label: "Type" },
      { id: "status", label: "Status" },
    ],
    "Additional Details": [
      { id: "notes", label: "Notes" },
      { id: "tip", label: "Tip" },
      { id: "discount", label: "Discount" },
      { id: "location", label: "Location" },
      { id: "state", label: "State" },
    ],
    "Product Details": [
      { id: "dogTrainingAgency", label: "Dog Training Agency" },
      { id: "dogName", label: "Dog's Name" },
      { id: "supplier", label: "Supplier" },
      { id: "supplierOrderNumber", label: "Supplier Order #" },
      { id: "shopifyOrderNumber", label: "Shopify Order #" },
      { id: "itemizedWholesaleSpend", label: "Itemized Wholesale Spend" },
    ],
    "Financial Information": [
      { id: "startingCashBalance", label: "Starting Cash Balance" },
      { id: "endingCashBalance", label: "Ending Cash Balance" },
      { id: "wholesaleCost", label: "Wholesale Cost" }, 
      { id: "revenue", label: "Revenue" },
      { id: "estimatedWholesaleCost", label: "Estimated Wholesale Cost" },
      { id: "estimatedProfit", label: "Estimated Profit" },
      { id: "estimatedProfitPercentage", label: "Estimated Profit %" },
      { id: "estimatedItemizedProfit", label: "Estimated Itemized Profit" },
    ],
    "Expenses": [
      { id: "softwareCost", label: "Software Cost" },
      { id: "adsCost", label: "Ads Cost" },
      { id: "equipmentCost", label: "Equipment Cost" },
      { id: "miscellaneousExpense", label: "Miscellaneous Expense" },
      { id: "printMediaExpense", label: "Print Media Expense" },
      { id: "shippingCost", label: "Shipping Cost" },
      { id: "transitCost", label: "Transit Cost" },
      { id: "dryIceCost", label: "Dry Ice Cost" },
      { id: "packagingCost", label: "Packaging Cost" },
      { id: "spaceRentalCost", label: "Space Rental Cost" },
      { id: "fee", label: "Fee" },
      { id: "pawsabilityRent", label: "Pawsability Rent" },
      { id: "otherCost", label: "Other Cost" },
    ],
    "Payments": [
      { id: "paidToMadeline", label: "Paid to Madeline" },
      { id: "paidToGeoff", label: "Paid to Geoff" },
      { id: "actuallySentToMadeline", label: "Actually Sent to Madeline" },
      { id: "withheldForMadelineIncomeTax", label: "Withheld for Madeline Income Tax" },
      { id: "actuallySentToGeoff", label: "Actually Sent to Geoff" },
      { id: "withheldForGeoffIncomeTax", label: "Withheld for Geoff Income Tax" },
      { id: "investmentFromMadeline", label: "Investment from Madeline" },
      { id: "investmentFromGeoff", label: "Investment from Geoff" },
    ],
    "Other": [
      { id: "gmailMessageId", label: "Gmail Message ID" },
    ]
  }
  
  // Fetch products from MongoDB
  const fetchProducts = async () => {
    try {
      setIsLoadingProducts(true);
      const response = await fetch('/api/products');
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      setMongoProducts(data.products || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to fetch products');
    } finally {
      setIsLoadingProducts(false);
    }
  };
  
  // Add fetchProducts call during component initialization
  useEffect(() => {
    // Load products when the component mounts
    fetchProducts();
  }, []);
  
  // Function to preload product data before showing the match dialog
  const preloadForProductMatching = async () => {
    // Set loading state
    setIsCommitting(true);
    
    try {
      // Make sure products are loaded
      if (mongoProducts.length === 0) {
        await fetchProducts();
      }
      
      // Preload auto-confirmed mappings to make the process faster
      await fetch('/api/smart-mapping/auto-confirmed');
      
      // Start the product matching workflow
      processNextUnmatchedProduct();
    } catch (error) {
      console.error('Error preloading for product matching:', error);
      toast.error('Error preparing product matching');
    } finally {
      setIsCommitting(false);
    }
  };
  
  // Function to prepare fields preview for transaction dialog
  const getFieldsPreview = (transaction: ProcessedTransaction | null = null) => {
    const fields: Array<{ id: string; label: string; value: React.ReactNode; originalData?: string }> = [];
    
    // Return empty fields if transaction is null
    if (!transaction) return fields;
    
    // Use the transaction provided or fall back to transactionToCommit
    const targetTransaction = transaction || transactionToCommit;
    
    if (!targetTransaction) return fields;
    
    // Check if this is a training transaction (has Client field)
    const isTraining = targetTransaction.Client !== undefined && targetTransaction.Client !== null && String(targetTransaction.Client) !== '';
    
    // Check if this is an expense transaction
    const isExpense = !isTraining && isExpenseTransaction(targetTransaction);
    
    // Include common transaction details
    fields.push({
      id: 'id',
      label: 'Transaction ID',
      value: targetTransaction['Transaction ID'] || 'N/A'
    });
    
    fields.push({
      id: 'date',
      label: 'Date',
      value: formatTransactionDate(targetTransaction.Date || '') 
    });
    
    fields.push({
      id: 'type',
      label: 'Type',
      value: isTraining ? 'Training' : (isExpense ? 'Purchase' : 'Sale')
    });
    
    // Add source field
    fields.push({
      id: 'source',
      label: 'Source',
      value: 'Excel Import'
    });
    
    // Add payment method
    const paymentMethod = targetTransaction['Payment method']?.toString() || '';
    fields.push({
      id: 'paymentMethod',
      label: 'Payment Method',
      value: paymentMethod || 'N/A'
    });
    
    // Handle fields specific to transaction type
    if (isTraining) {
      // Add training-specific fields
      fields.push({
        id: 'trainer',
        label: 'Trainer',
        value: 'Madeline Pape' // Default trainer
      });
      
      fields.push({
        id: 'clientName',
        label: 'Client Name',
        value: targetTransaction.Client || 'N/A'
      });
      
      if (targetTransaction["Dog's name"]) {
        fields.push({
          id: 'dogName',
          label: 'Dog Name',
          value: targetTransaction["Dog's name"]
        });
      }
      
      // Add Dog training agency to the preview if it exists
      if (targetTransaction["Dog training agency"]) {
        fields.push({
          id: 'trainingAgency',
          label: 'Training Agency',
          value: targetTransaction["Dog training agency"]
        });
      }
      
      fields.push({
        id: 'description',
        label: 'Description',
        value: 'Dog training session'
      });
      
      fields.push({
        id: 'revenue',
        label: 'Revenue',
        value: typeof targetTransaction.Revenue === 'number' 
          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(targetTransaction.Revenue))
          : '-',
      });
      
      if (targetTransaction['Sales tax'] !== undefined && targetTransaction['Sales tax'] !== null && String(targetTransaction['Sales tax']) !== '') {
        fields.push({
          id: 'taxAmount',
          label: 'Tax Amount',
          value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(targetTransaction['Sales tax']))
        });
        
        fields.push({
          id: 'isTaxable',
          label: 'Is Taxable',
          value: Number(targetTransaction['Sales tax']) > 0 ? 'Yes' : 'No'
        });
      }
      
      fields.push({
        id: 'status',
        label: 'Status',
        value: 'Completed'
      });
    }
    else if (isExpense) {
      fields.push({
        id: 'supplier',
        label: 'Supplier',
        value: targetTransaction.Supplier || 'N/A'
      });
      
      fields.push({
        id: 'supplierOrderNumber',
        label: 'Supplier Order #',
        value: targetTransaction['Supplier order #'] || 'N/A'
      });
      
      // For expense transactions, use the same expense fields as elsewhere in the code
      const expenseFields = [
        { field: 'Wholesale cost', label: 'Wholesale', category: 'inventory' },
        { field: 'Software cost', label: 'Software', category: 'software' },
        { field: 'Ads cost', label: 'Ads', category: 'advertising' },
        { field: 'Equipment cost', label: 'Equipment', category: 'equipment' },
        { field: 'Miscellaneous expense', label: 'Misc', category: 'other' },
        { field: 'Print media expense', label: 'Print Media', category: 'advertising' },
        { field: 'Shipping cost', label: 'Shipping', category: 'shipping' },
        { field: 'Transit cost', label: 'Transit', category: 'transit' },
        { field: 'Dry ice cost', label: 'Dry Ice', category: 'supplies' },
        { field: 'Packaging cost', label: 'Packaging', category: 'supplies' },
        { field: 'Space rental cost', label: 'Space Rental', category: 'rent' },
        { field: 'Pawsability rent', label: 'Pawsability Rent', category: 'rent' },
        { field: 'Other cost', label: 'Other', category: 'other' }
      ];
      
      // Collect all expense fields with values
      const expensesWithValues = expenseFields
        .map(expense => {
          const value = targetTransaction[expense.field as keyof ProcessedTransaction];
          if (typeof value === 'number' && value > 0) {
            return {
              field: expense.field,
              label: expense.label,
              category: expense.category,
              value,
              formatted: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
            };
          }
          return null;
        })
        .filter(expense => expense !== null);
      
      // If we have expenses, show them
      if (expensesWithValues.length > 0) {
        // Show the first expense as the main amount
        const primaryExpense = expensesWithValues[0]!;
        fields.push({
          id: 'amount',
          label: 'Amount',
          value: (
            <div>
              <div className="font-medium">{primaryExpense.formatted}</div>
              <div className="text-sm text-gray-600">Type: {primaryExpense.label}</div>
              <div className="text-sm text-gray-600">Category: {primaryExpense.category}</div>
            </div>
          )
        });
        
        // If there are multiple expenses, show them all
        if (expensesWithValues.length > 1) {
          fields.push({
            id: 'additionalExpenses',
            label: 'Additional Expenses',
            value: (
              <div className="space-y-2">
                {expensesWithValues.slice(1).map((expense, idx) => (
                  <div key={idx} className="flex justify-between border-b pb-1">
                    <span>{expense.label}:</span> 
                    <span>{expense.formatted}</span>
                  </div>
                ))}
              </div>
            )
          });
        }
      } else {
        // If no expense was found in any column, still show a placeholder
        fields.push({
          id: 'amount',
          label: 'Amount',
          value: 'N/A (No expense amount found)'
        });
      }
      
      // Include any notes
      if (targetTransaction.Note) {
        fields.push({
          id: 'notes',
          label: 'Notes',
          value: targetTransaction.Note
        });
      }
    }
    // For sales (non-training, non-expense), display customer info and revenue
    else {
      fields.push({
        id: 'customer',
        label: 'Customer',
        value: targetTransaction.Customer || targetTransaction.Client || 'N/A'
      });
      
      fields.push({
        id: 'revenue',
        label: 'Revenue',
        value: typeof targetTransaction.Revenue === 'number' 
          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(transaction.Revenue))
          : '-',
      });
      
      if (targetTransaction.Tip) {
        fields.push({
          id: 'tip',
          label: 'Tip',
          value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(transaction.Tip))
        });
      }
      
      if (targetTransaction.Discount) {
        fields.push({
          id: 'discount',
          label: 'Discount',
          value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(transaction.Discount))
        });
      }
      
      if (targetTransaction['Sales tax']) {
        fields.push({
          id: 'taxAmount',
          label: 'Tax Amount',
          value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(transaction['Sales tax']))
        });
      }
      
      const isSquareTransaction = targetTransaction['Transaction ID']?.toString().startsWith('sq_') || 
                                 paymentMethod?.toLowerCase().includes('square');
      
      if (!isSquareTransaction) {
        fields.push({
          id: 'excelId',
          label: 'Excel Transaction ID',
          value: targetTransaction['Transaction ID'] || 'N/A'
        });
      }
    }
    
    // Always include excelId field for all Excel transactions if not already added
    if (!fields.some(f => f.id === 'excelId')) {
      fields.push({
        id: 'excelId',
        label: 'Excel ID',
        value: targetTransaction['Transaction ID'] || 'N/A'
      });
    }
    
    // Add products field for product display
    // Check both regular Products and Itemized wholesale spend
    const productsStr = targetTransaction.Products || targetTransaction['Itemized wholesale spend'];
    
    if (productsStr) {
      // Try to parse the Products JSON
      const productsObj = parseProductsJson(productsStr);
      
      if (productsObj && Object.keys(productsObj).length > 0) {
        fields.push({
          id: 'products',
          label: 'Products/Items',
          value: (
            <div className="text-sm space-y-3">
              {Object.entries(productsObj).map(([productKey, productValue], index) => {
                // Handle both simple and detailed formats
                let productName = productKey;
                let displayQuantity = "";
                
                if (typeof productValue === 'object' && productValue !== null) {
                  // Detailed format with name, count/qty, spend
                  const detailedData = productValue as {name?: string; count?: string | number; qty?: string | number; spend?: string | number};
                  productName = detailedData.name || productKey;
                  // Use count if available, otherwise try qty as fallback
                  if ('count' in detailedData) {
                    displayQuantity = detailedData.count ? String(detailedData.count) : "";
                  } else if ('qty' in detailedData) {
                    displayQuantity = detailedData.qty ? String(detailedData.qty) : "";
                  }
                } else {
                  // Simple format with just quantities
                  displayQuantity = typeof productValue === 'string' ? productValue as string : String(productValue || '');
                }
                
                return (
                  <div key={index} className="p-2 border rounded-md bg-gray-50">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-700">
                        {productName}
                        {displayQuantity && <span className="text-gray-600 ml-1">(x{displayQuantity})</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ),
          originalData: JSON.stringify(productsObj)
        });
      }
    }
    
    return fields;
  };
  
  // Function to determine how to display transaction status in the table
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  const getStatusDisplay = (transaction: ProcessedTransaction) => {
    // Check if this is an expense transaction
    const isExpense = transaction.isExpense;
    
    // Status color classes
    const statusClasses = {
      duplicate: 'bg-orange-100 text-orange-800 border-orange-200',
      new: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      expense: 'bg-amber-100 text-amber-800 border-amber-200',
      sale: 'bg-sky-100 text-sky-800 border-sky-200'
    };
    
    return (
      <div className="space-y-1">
        {/* Transaction Type Badge */}
        <span className={`inline-block px-2 py-1 text-xs font-medium rounded-md border ${
          isExpense ? statusClasses.expense : statusClasses.sale
        }`}>
          {isExpense ? 'Expense' : 'Sale'}
        </span>
        
        {/* Match Status Badge */}
        <span className={`inline-block px-2 py-1 text-xs font-medium rounded-md border ${
          transaction.exists ? statusClasses.duplicate : statusClasses.new
        }`}>
          {transaction.matchType}
        </span>
      </div>
    );
  };
  
  // Convert DB transaction to internal format
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const convertTransaction = (dbTransaction: DbTransaction): InternalTransaction => {
    const { _id, id = '', source = '', date = '', amount = 0, ...rest } = dbTransaction
    return {
      _id,
      id,
      source,
      date,
      amount,
      ...rest
    }
  }
  
  // Function to verify if the transaction already exists in MongoDB
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const checkExistence = (row: ProcessedTransaction, existingTransactions: ExistingTransactions): boolean => {
    try {
      // Determine if this is an expense transaction
      const isExpense = isExpenseTransaction(row);
      
      console.log(`🔍 Checking if ${isExpense ? 'expense' : 'sale'} exists in MongoDB:`, {
        transactionId: row['Transaction ID'],
        isExpense,
        supplierOrderNumber: isExpense ? row['Supplier order #'] : undefined,
        supplier: isExpense ? row.Supplier : undefined,
        amount: isExpense ? row['Wholesale cost'] : row.Revenue
      });
      
      if (!existingTransactions || !existingTransactions.transactions || !Array.isArray(existingTransactions.transactions)) {
        console.warn('⚠️ No existing transactions found for checking duplicates');
        return false;
      }
      
      // For sales: Check by transaction ID or excelId
      if (!isExpense) {
        const paymentMethod = row['Payment method']?.toString().toLowerCase() || '';
        const isExcelTransaction = ['venmo', 'cash app', 'cash'].some(method => paymentMethod.includes(method));
        
        // First, prioritize checking by excelId for all transactions
        const excelIdMatch = existingTransactions.transactions.find(
          (t: TransactionRecord) => {
            if (!t || !t.excelId) return false;
            
            // Check if Transaction ID matches the excelId field in MongoDB
            const matches = t.excelId === row['Transaction ID'];
            
            if (matches) {
              console.log(`✅ Found transaction match by excelId: "${row['Transaction ID']}" matches MongoDB excelId "${t.excelId}"`);
            }
            
            return matches;
          }
        );
        
        if (excelIdMatch) {
          return true;
        }

        // If not an Excel transaction, check for exact id match
        // (for non-Excel sources like Square, Shopify, etc.)
        if (!isExcelTransaction) {
          const exactMatch = existingTransactions.transactions.find(
            (t: TransactionRecord) => t && t.id && t.id === row['Transaction ID']
          );
          
          if (exactMatch) {
            console.log('✅ Found exact MongoDB match by ID:', exactMatch.id);
            return true;
          }
        }
        
        // Check for Square transactions (MongoDB has "square_" prefixed to ID)
        // but Excel sheet might have it without the prefix
        const squareMatch = existingTransactions.transactions.find(
          (t: TransactionRecord) => {
            if (!t || !t.id) return false;
            
            // Handle both cases: 
            // 1. MongoDB ID is "square_123" and Excel ID is "123"
            // 2. MongoDB ID is "123" and Excel ID is "square_123"
            if (t.id === `square_${row['Transaction ID']}`) return true;
            
            if (t.id.startsWith('square_') && t.id.substring(7) === row['Transaction ID']) return true;
            
            if (row['Transaction ID'] && row['Transaction ID'].startsWith('square_') && 
                t.id === row['Transaction ID'].substring(7)) return true;
                
            return false;
          }
        );
        
        if (squareMatch) {
          console.log('✅ Found Square transaction match:', squareMatch.id);
          return true;
        }
      } 
      // For expenses: Check by supplier order number, supplier name, and amount
      else {
        const expenseMatch = existingTransactions.transactions.find(
          (t: TransactionRecord) => {
            if (!t || t.type !== 'purchase') return false;
            
            const supplierMatches = t.supplier === row.Supplier;
            const orderNumberMatches = t.supplierOrderNumber === row['Supplier order #'];
            const amountMatches = Number(t.amount) === Number(row['Wholesale cost']);
            
            // Consider it a match if supplier and either order number or amount match
            const isMatch = supplierMatches && (orderNumberMatches || amountMatches);
            
            if (isMatch) {
              console.log('✅ Found expense match:', {
                existingSupplier: t.supplier,
                newSupplier: row.Supplier,
                existingOrderNum: t.supplierOrderNumber,
                newOrderNum: row['Supplier order #'],
                existingAmount: t.amount,
                newAmount: row['Wholesale cost']
              });
            }
            
            return isMatch;
          }
        );
        
        if (expenseMatch) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking existence:', error);
      return false;
    }
  };
  
  // Helper functions for formatting
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formatTransactionDate = (date: string | Date | undefined, includeTime = false): string => {
    if (!date) return 'N/A';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Invalid Date';
    
    const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
    
    if (includeTime) {
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${dateStr} ${timeStr}`;
    }
    
    return dateStr;
  };
  
  // Helper function to format currency
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formatCurrency = (amount: string | number | undefined): string => {
    if (amount === undefined || amount === null) return '$0.00';
    
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (isNaN(numAmount)) return '$0.00';
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(numAmount);
  };
  
  // Function to open transaction dialog for commitment
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const openTransactionDialog = (transaction: ProcessedTransaction) => {
    // Get the index of the transaction
    const index = processedTransactions.findIndex(t => 
      t['Transaction ID'] === transaction['Transaction ID']
    );
    
    if (index !== -1) {
      setTransactionToCommit(transaction);
      setCommitFieldsPreviewState(getFieldsPreview(transaction));
      setShowCommitDialog(true);
    }
  };
  
  // Function to commit a transaction to MongoDB
  const commitTransaction = async (transaction: ProcessedTransaction) => {
    try {
      // Prepare the transaction for import with selected fields
      const preparedTransaction = await prepareTransactionForImport(transaction);
      
      // Preview the fields before sending
      setCommitFieldsPreviewState(getFieldsPreview(transaction));
      setTransactionToCommit(transaction);
      setTransactionToSubmit(preparedTransaction);
      setShowCommitDialog(true);
    } catch (error) {
      console.error('Error preparing transaction for commit:', error);
      toast.error('Failed to prepare transaction for commit');
    }
  };
  
  // Function to finalize a transaction commit
  const finalizeTransactionCommit = async () => {
    try {
      // Only proceed if we have a transaction to commit
      if (transactionToCommit === null || !transactionToSubmit) {
        toast.error("No transaction selected for commit");
        return;
      }
      
      // DEBUG: Check the mongoProducts array
      console.log(`🧪 DEBUG: mongoProducts array has ${mongoProducts.length} products`);
      console.log(`🧪 First few product examples:`, mongoProducts.slice(0, 3).map(p => ({
        _id: p._id,
        name: p.name,
        price: p.price,
        lastPurchasePrice: p.lastPurchasePrice
      })));
      
      // Get the current transaction and its products
      const currentTransaction = transactionToCommit;
      const isExpense = isExpenseTransaction(currentTransaction);

      // Check for detailed products format first in Itemized wholesale spend for expenses
      let productsObj = {};
      let isDetailedFormat = false;
      
      if (isExpense && currentTransaction['Itemized wholesale spend']) {
        productsObj = parseProductsJson(currentTransaction['Itemized wholesale spend']);
        isDetailedFormat = Object.values(productsObj).some(value => 
          typeof value === 'object' && value !== null && 'name' in (value as object)
        );
        
        if (isDetailedFormat) {
          console.log('📊 Using detailed product format from Itemized wholesale spend');
        }
      }
      
      // If not a detailed expense format, fall back to regular Products
      if (!isDetailedFormat) {
        productsObj = parseProductsJson(currentTransaction.Products);
      }
      
      // CRITICAL DEBUG: Check all manual matches
      console.log(`🧩 DEBUG: Current manual matches:`, manualMatches);
      
      if (productsObj && transactionToSubmit) {
        // Create properly formatted products array
        const formattedProducts: FormattedProduct[] = [];
        
        // Process each product
        for (const [productKey, productValue] of Object.entries(productsObj)) {
          // Handle both simple and detailed product formats
          let productName = productKey;
          let numericQuantity = 0;
          let productSpend = 0;
          
          if (isDetailedFormat && typeof productValue === 'object' && productValue !== null) {
            // Detailed format for purchases
            const detailedData = productValue as {name: string; count?: string | number; qty?: string | number; spend?: string | number};
            productName = detailedData.name || productKey;
            // Use count if available, otherwise try qty as fallback
            if ('count' in detailedData) {
              numericQuantity = typeof detailedData.count === 'string' ? parseFloat(detailedData.count) : Number(detailedData.count);
            } else if ('qty' in detailedData) {
              numericQuantity = typeof detailedData.qty === 'string' ? parseFloat(detailedData.qty) : Number(detailedData.qty);
            }
            productSpend = typeof detailedData.spend === 'string' ? parseFloat(detailedData.spend as string) : Number(detailedData.spend || 0);
            
            console.log(`\n🔍 Processing detailed product "${productName}" with qty ${numericQuantity} and spend ${productSpend}`);
          } else {
            // Simple format with just quantities
            numericQuantity = typeof productValue === 'string' ? parseFloat(productValue) : Number(productValue);
            console.log(`\n🔍 Processing product "${productName}" with qty ${numericQuantity}`);
          }
          
          // First try manual match
          const manualMatchId = manualMatches[productName];
          console.log(`🧩 Manual match ID for "${productName}": ${manualMatchId || 'none'}`);
          
          let matchedProduct: MongoProduct | null = null;
          
          // Check if we have a manual match
          if (manualMatchId) {
            // Look up the product by its ID
            matchedProduct = mongoProducts.find(p => p._id === manualMatchId) ?? null;
            console.log(`🧩 Manual match result: ${matchedProduct ? matchedProduct.name : 'Not found'}`);
          }
          
          // If no manual match, try automatic matching
          if (!matchedProduct) {
            // Try case-insensitive, trimmed match
            const normalizedName = productName.toLowerCase().trim();
            console.log(`🔍 Trying automatic match with normalized name: "${normalizedName}"`);
            
            // Step 1: First try exact match (case-insensitive)
            matchedProduct = mongoProducts.find(p => 
              p.name.toLowerCase().trim() === normalizedName
            ) ?? null;
            
            console.log(`🔍 Exact match result: ${matchedProduct ? matchedProduct.name : 'Not found'}`);
            
            // Step 2: If no exact match, try partial matching
            if (!matchedProduct) {
              console.log(`🔍 Trying partial matching for "${normalizedName}"`);
              
              // Find products with some similarity
              const scoredMatches = mongoProducts
                .map(p => {
                  const score = calculateSimilarityScore(p.name, productName);
                  return { product: p, score };
                })
                .filter(item => item.score > 20) // Only consider products with a reasonable match score
                .sort((a, b) => b.score - a.score); // Sort by score (highest first)
              
              if (scoredMatches.length > 0) {
                console.log(`🔍 Found ${scoredMatches.length} potential matches`);
                
                // Debug: Show top 3 scored matches
                console.log(`🏆 Top matches:`, 
                  scoredMatches.slice(0, 3).map(m => ({
                    name: m.product.name, 
                    score: m.score.toFixed(2)
                  }))
                );
                
                // Only use matches that have a score above the threshold
                if (scoredMatches[0].score >= 40) {
                  matchedProduct = scoredMatches[0].product;
                  
                  // Store this match in manualMatches to ensure consistency between preview and final commit
                  setManualMatches(prev => ({
                    ...prev,
                    [productName]: matchedProduct!._id
                  }));
                  
                  console.log(`🔍 Selected and saved best match: ${matchedProduct.name} (score: ${scoredMatches[0].score.toFixed(2)})`);
                } else {
                  console.log(`❌ Best match score ${scoredMatches[0].score.toFixed(2)} below threshold (40), not using it`);
                }
              }
            }
          }
          
          if (matchedProduct) {
            // Successfully matched - get the price based on transaction type
            console.log(`✅ Matched with: ${matchedProduct.name}`);
            
            // Ensure the price is a number
            let unitPrice = 0;
            
            if (isExpense) {
              // For purchases, use lastPurchasePrice if available
              console.log(`💲 Purchase price data: ${JSON.stringify(matchedProduct.lastPurchasePrice)}`);
              if (typeof matchedProduct.lastPurchasePrice === 'number') {
                unitPrice = matchedProduct.lastPurchasePrice;
              } else if (typeof matchedProduct.lastPurchasePrice === 'string') {
                unitPrice = parseFloat(matchedProduct.lastPurchasePrice);
              }
            } else {
              // For sales, use price
              console.log(`💲 Retail price data: ${JSON.stringify(matchedProduct.price)}`);
              if (typeof matchedProduct.price === 'number') {
                unitPrice = matchedProduct.price;
              } else if (typeof matchedProduct.price === 'string') {
                unitPrice = parseFloat(matchedProduct.price);
              }
            }
            
            console.log(`💲 Final unit price: ${unitPrice}`);
            
            // Calculate total price - use actual spend if available from detailed format
            const totalPrice = productSpend > 0 ? productSpend : unitPrice * numericQuantity;
            
            // Add the formatted product with all data
            formattedProducts.push({
              name: matchedProduct.name,
              quantity: numericQuantity,
              unitPrice: unitPrice,
              totalPrice: totalPrice,
              productId: matchedProduct._id,
              originalName: productName !== matchedProduct.name ? productName : undefined
            });
          } else {
            // No match found - use original data
            console.log(`⚠️ No match found for "${productName}"`);
            
            // Use actual spend if available for unmatched products
            const calculatedUnitPrice = productSpend > 0 ? productSpend / numericQuantity : 0;
            const calculatedTotalPrice = productSpend > 0 ? productSpend : 0;
            
            formattedProducts.push({
              name: productName,
              quantity: numericQuantity,
              unitPrice: calculatedUnitPrice,
              totalPrice: calculatedTotalPrice,
              originalName: productName
            });
          }
        }
        
        // Update the transaction with the formatted products
        if (transactionToSubmit) {
          transactionToSubmit.products = formattedProducts;
          console.log('✅ Final products being sent to MongoDB:', formattedProducts);
        }
      }
      
      // Send the transaction to our API
      console.log('🚀 Submitting transaction to MongoDB:', transactionToSubmit);
      
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transactionToSubmit),
      });
      
      if (!response.ok) {
        toast.error("Failed to commit transaction");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const result = await response.json();
      
      // Update the transaction in our local state to show it's committed
      if (transactionToCommit !== null) {
        const updatedTransactions = [...processedTransactions];
        const index = processedTransactions.findIndex(t => 
          t['Transaction ID'] === transactionToCommit['Transaction ID']
        );
        
        if (index !== -1) {
          updatedTransactions[index] = {
            ...updatedTransactions[index],
            exists: true,
            matchType: 'exact' // Changed from 'Committed' to 'exact' to match the type
          };
          
          setProcessedTransactions(updatedTransactions);
        }
        setShowCommitDialog(false);
        setTransactionToCommit(null);
        setTransactionToSubmit(null);
        
        // Show success toast
        toast.success("Transaction committed successfully");
      }
    } catch (error) {
      console.error("Error committing transaction:", error);
      toast.error("An error occurred while committing the transaction");
    }
  };
  
  // Function to set a product match
  const setProductMatch = async (excelProductName: string, mongoProductId: string) => {
    try {
      // Find the matched MongoDB product
      const matchedProduct = mongoProducts.find(p => p._id === mongoProductId);
      if (!matchedProduct) {
        console.error('Could not find MongoDB product with ID:', mongoProductId);
        return;
      }
      
      // Record the mapping
      const response = await fetch('/api/smart-mapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mappingType: 'product_names',
          source: excelProductName.toLowerCase().trim(),
          target: matchedProduct.name,
          targetId: mongoProductId
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to record product mapping');
      }
      
      // Update manual matches state
      setManualMatches(prev => ({
        ...prev,
        [excelProductName]: mongoProductId
      }));
      
      // If the dialog is open, update the transaction preview
      if (transactionToCommit) {
        const index = processedTransactions.findIndex(t => t === transactionToCommit);
        if (index !== -1) {
          showCommitPreview(index);
        }
      }
      
      toast.success('Product mapping recorded');
    } catch (error) {
      console.error('Error recording product mapping:', error);
      toast.error('Failed to record product mapping');
    }
  };
  
  // Add this helper function near the top of the component
  const getTransactionByRef = (txRef: ProcessedTransaction | null) => {
    if (!txRef) return null;
    // First try to find by Transaction ID
    return txRef;
  };

  // Function to count selected transactions
  const getSelectedCount = (): number => {
    return Array.from(selectedTransactions.entries())
      .filter(([, selected]) => selected === true)
      .length;
  };

  // Helper function to find unmatched products in a transaction
  const findUnmatchedProducts = async (transaction: ProcessedTransaction): Promise<string[]> => {
    const unmatchedProducts: string[] = [];
    
    try {
      // For expenses, check both Products and Itemized wholesale spend
      const isExpense = isExpenseTransaction(transaction);
      
      // First try to get products from Itemized wholesale spend for expenses
      let productsObj = {};
      if (isExpense && transaction['Itemized wholesale spend']) {
        productsObj = parseProductsJson(transaction['Itemized wholesale spend']);
      }
      
      // If no products found in Itemized wholesale spend or not an expense, try regular Products
      if (Object.keys(productsObj).length === 0 && transaction.Products) {
        productsObj = parseProductsJson(transaction.Products);
      }
      
      // If we have products, check each one for a match
      if (Object.keys(productsObj).length > 0) {
        // Fetch auto-confirmed mappings from the smart mapping service
        let autoConfirmedMappings: Record<string, { productId: string, productName: string, confidence: number }> = {};
        try {
          const response = await fetch('/api/smart-mapping/auto-confirmed');
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.mappings) {
              autoConfirmedMappings = data.mappings;
              console.log(`Loaded ${Object.keys(autoConfirmedMappings).length} auto-confirmed product mappings`);
            }
          }
        } catch (error) {
          console.error('Error loading auto-confirmed mappings:', error);
        }
        
        for (const [productKey, productValue] of Object.entries(productsObj)) {
          // Get product name based on format
          let productName = productKey;
          
          // Check if this is detailed format with name field
          if (typeof productValue === 'object' && productValue !== null && 'name' in productValue) {
            productName = (productValue as { name: string }).name || productKey;
          }
          
          // First check for manual match
          const manualMatchId = manualMatches[productName];
          
          // Then check auto-confirmed mappings
          const normalizedName = productName.toLowerCase().trim();
          const autoConfirmedMatch = autoConfirmedMappings[normalizedName];
          
          // If we have an auto-confirmed match, apply it automatically
          if (!manualMatchId && autoConfirmedMatch) {
            console.log(`Using auto-confirmed match for "${productName}": ${autoConfirmedMatch.productName} (confidence: ${autoConfirmedMatch.confidence})`);
            
            // Save this as a manual match so it's used consistently
            setManualMatches(prev => ({
              ...prev,
              [productName]: autoConfirmedMatch.productId
            }));
            
            // Skip this product as we've handled it
            continue;
          }
          
          // If we don't have a manual or auto-confirmed match, try to find a match
          if (!manualMatchId && !autoConfirmedMatch) {
            // Try exact match first
            const exactMatch = mongoProducts.find(p => 
              p.name.toLowerCase().trim() === productName.toLowerCase().trim()
            );
            
            // If no exact match, try similarity scoring
            if (!exactMatch) {
              // Calculate similarity with all products
              const scoredMatches = mongoProducts
                .map(p => {
                  const score = calculateSimilarityScore(p.name, productName);
                  return { product: p, score };
                })
                .filter(item => item.score > 20)
                .sort((a, b) => b.score - a.score);
              
              // If no good match (score < 40), add to unmatched list
              if (scoredMatches.length === 0 || scoredMatches[0].score < 40) {
                unmatchedProducts.push(productName);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking for unmatched products:', error);
    }
    
    return unmatchedProducts;
  };

  // Function to handle the product matching workflow
  const processNextUnmatchedProduct = () => {
    // Reset search term and results when opening a new product
    setProductSearchTerm('');
    setSuggestedProducts([]);
    
    // Find the first transaction with unmatched products
    for (const [index, unmatchedProducts] of Array.from(transactionsWithUnmatchedProducts.entries())) {
      if (unmatchedProducts.length > 0) {
        // Set the current unmatched product for the dialog
        setCurrentUnmatchedProduct({
          transactionIndex: index,
          productName: unmatchedProducts[0]
        });
        
        // Show the dialog - this should happen immediately
        setShowProductMatchDialog(true);
        
        // Pre-search with the product name to provide initial results
        setTimeout(() => {
          handleProductSearch(unmatchedProducts[0]);
        }, 100);
        
        return;
      }
    }
    
    // If we get here, there are no more unmatched products
    setShowProductMatchDialog(false);
    setCurrentUnmatchedProduct(null);
  };
  
  // Function to handle manual product matching
  const handleProductMatch = async (selectedProductId: string) => {
    if (!currentUnmatchedProduct) return;
    
    // Get the selected product details
    const selectedProduct = suggestedProducts.find(p => p._id === selectedProductId);
    if (!selectedProduct) {
      toast.error('Could not find the selected product');
      return;
    }
    
    // Save the manual match in local state
    setManualMatches(prev => ({
      ...prev,
      [currentUnmatchedProduct.productName]: selectedProductId
    }));
    
    // Send this mapping to the SmartMappingService to improve future matches
    try {
      const response = await fetch('/api/smart-mapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mappingType: 'product_names',
          source: currentUnmatchedProduct.productName,
          target: selectedProduct.name,
          targetId: selectedProduct._id,
          // Add additional metadata
          metadata: {
            lastMatchedAt: new Date().toISOString(),
            userConfirmed: true,
            manuallyMatched: true
          }
        }),
      });
      
      if (response.ok) {
        console.log('Product mapping saved to SmartMappingService');
      } else {
        console.error('Failed to save product mapping');
      }
    } catch (error) {
      console.error('Error recording product mapping:', error);
    }
    
    // Update the unmatched products list for this transaction
    const { transactionIndex, productName } = currentUnmatchedProduct;
    const unmatchedProducts = transactionsWithUnmatchedProducts.get(transactionIndex) || [];
    const updatedUnmatched = unmatchedProducts.filter(p => p !== productName);
    
    // Update the map
    const newMap = new Map(transactionsWithUnmatchedProducts);
    
    if (updatedUnmatched.length > 0) {
      newMap.set(transactionIndex, updatedUnmatched);
      toast.success(`Product "${productName}" matched to "${selectedProduct.name}"`);
    } else {
      // If no more unmatched products for this transaction, remove it from the map
      newMap.delete(transactionIndex);
      toast.success(`All products in transaction ${transactionIndex + 1} are now matched`);
    }
    
    setTransactionsWithUnmatchedProducts(newMap);
    
    // Process next unmatched product if any
    if (newMap.size > 0) {
      processNextUnmatchedProduct();
    } else {
      // No more unmatched products
      setShowProductMatchDialog(false);
      setCurrentUnmatchedProduct(null);
      toast.success('All products have been matched!');
    }
  };

  // Determine transaction row background color based on type
  const getTransactionRowBackground = (transaction: ProcessedTransaction): string => {
    if (transaction.Client) {
      // Training transaction (pastel green)
      return "bg-green-50";
    } else if (isExpenseTransaction(transaction)) {
      // Purchase transaction (pastel red)
      return "bg-red-50";
    } else {
      // Sale transaction (pastel green)
      return "bg-green-50";
    }
  };

  // Function to edit transaction amount
  const [editingAmount, setEditingAmount] = useState<{index: number, field: string, value: string} | null>(null);

  const handleEditAmount = (index: number, field: string, currentValue: number | string) => {
    setEditingAmount({
      index, 
      field, 
      value: currentValue ? String(currentValue) : ''
    });
  };

  const saveEditedAmount = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && editingAmount) {
      const { index, field, value } = editingAmount;
      
      // Update the transaction with the new amount
      const updatedTransactions = [...processedTransactions];
      const numericValue = parseFloat(value);
      
      if (!isNaN(numericValue)) {
        updatedTransactions[index] = {
          ...updatedTransactions[index],
          [field]: numericValue
        };
        
        setProcessedTransactions(updatedTransactions);
        toast.success(`Updated ${field} to ${numericValue}`);
      } else {
        toast.error("Please enter a valid number");
      }
      
      setEditingAmount(null);
    } else if (e.key === 'Escape') {
      setEditingAmount(null);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-8 relative">
      {/* Sticky Bulk Commit Panel */}
      {getSelectedCount() > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-md py-2 px-4">
          <div className="container mx-auto flex justify-between items-center">
            <div className="text-sm font-medium">{getSelectedCount()} transactions selected</div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedTransactions(new Map())}
              >
                Clear Selection
              </Button>
              {transactionsWithUnmatchedProducts.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={preloadForProductMatching}
                  className="flex items-center"
                >
                  <AlertTriangle className="mr-2 h-4 w-4 text-amber-500" />
                  Match Products ({Array.from(transactionsWithUnmatchedProducts.values()).reduce((sum, products) => sum + products.length, 0)})
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleDirectBulkCommit}
                disabled={isCommitting}
              >
                {isCommitting ? (
                  <div className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span>Processing...</span>
                  </div>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    <span>Import Selected ({selectedTransactions.size})</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Sales Transactions</h1>
          <div className="flex items-center space-x-4">
            {/* Show loading spinner when fetching products */}
            {isLoadingProducts && <Loader2 className="animate-spin h-6 w-6" />}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="upload">Upload Transactions</TabsTrigger>
            <TabsTrigger value="review" disabled={processedTransactions.length === 0}>
              Review ({processedTransactions.length})
            </TabsTrigger>
            <TabsTrigger value="list">Transaction List</TabsTrigger>
          </TabsList>
          
          <TabsContent value="upload">
            <Card className="p-6">
              <h2 className="text-lg font-medium mb-4">Import Transactions from Excel</h2>
              
              <div className="mb-6">
                <div 
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center relative",
                    isUploading || file ? "border-primary-300 bg-primary-50" : "border-gray-300",
                    isUploading && "opacity-80"
                  )}
                >
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    disabled={isUploading || isProcessing}
                  />
                  <label
                    htmlFor="file-upload"
                    className={cn(
                      "cursor-pointer flex flex-col items-center justify-center",
                      (isUploading || isProcessing) && "pointer-events-none"
                    )}
                  >
                    {isUploading ? (
                      <>
                        <div className="h-12 w-12 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin mb-3" />
                        <span className="text-sm font-medium text-primary-700">
                          Uploading file...
                        </span>
                        <div className="w-full mt-2 bg-gray-200 rounded-full h-2.5">
                          <div 
                            className="bg-primary-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
                        </div>
                      </>
                    ) : isProcessing ? (
                      <>
                        <div className="h-12 w-12 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin mb-3" />
                        <span className="text-sm font-medium text-primary-700">
                          Processing transactions...
                        </span>
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className={cn(
                          "h-12 w-12 mb-3",
                          file ? "text-primary-600" : "text-gray-400"
                        )} />
                        <span className="text-sm font-medium text-gray-900">
                          {file ? file.name : "Drag & drop or click to upload Excel file"}
                        </span>
                        <span className="text-xs text-gray-500 mt-1">
                          .xlsx or .xls (max 10MB)
                        </span>
                      </>
                    )}
                  </label>
                  
                  {file && !isUploading && (
                    <div className="mt-4">
                      <div className="flex items-center justify-center text-xs text-green-600">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        File ready for processing
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    if (selectedTransactions.size > 0) {
                      setFieldSelectionOpen(true);
                    } else {
                      toast.error('Please select at least one transaction to import')
                    }
                  }}
                  disabled={selectedTransactions.size === 0}
                  className="flex items-center"
                >
                  {isCommitting ? (
                    <div className="flex items-center justify-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Processing...</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import Selected ({selectedTransactions.size})
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="review">
            <Card className="p-6">
              <div className="flex justify-between mb-6 items-center">
                <h2 className="text-lg font-medium">Review Transactions</h2>
                <div 
                  id="transactions-count" 
                  data-count={processedTransactions.length}
                  className="mr-4 text-sm text-gray-600"
                >
                  {processedTransactions.length} transactions found
                </div>
                <div className="flex gap-2">
                  <button
                    className="bg-blue-100 text-blue-800 px-4 py-2 rounded hover:bg-blue-200 mr-2 text-xs"
                    onClick={() => {
                      const newMap = new Map();
                      processedTransactions
                        .forEach((t, index) => {
                          if (!t.exists) {
                            newMap.set(index, true);
                          }
                        });
                      setSelectedTransactions(newMap);
                    }}
                  >
                    Select All New
                  </button>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedTransactions(new Map())}
                  >
                    Clear Selection
                  </Button>
                  <Button
                    onClick={handleDirectBulkCommit}
                    disabled={selectedTransactions.size === 0 || isCommitting}
                    className="flex items-center"
                  >
                    {isCommitting ? (
                      <div className="flex items-center justify-center">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Import Selected ({selectedTransactions.size})
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              <div className="border rounded-lg overflow-x-auto max-w-full">
                <table className="min-w-full divide-y divide-gray-200 table-fixed">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-20 w-24">
                        Select
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50 z-10 w-24">
                        Status
                      </th>
                      {tableFields.filter(field => !field.isHidden).map((field: TableField) => (
                        <th key={field.id} scope="col" className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50 z-10 ${field.id === 'description' ? 'w-72' : 'w-40'}`}>
                          {field.label}
                        </th>
                      ))}
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-20 w-32">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {processedTransactions.map((transaction, index) => (
                      <tr 
                        key={index}
                        className={cn(
                          "hover:bg-gray-50",
                          getTransactionRowBackground(transaction),
                          transaction.exists ? "bg-opacity-70" : "",
                          selectedTransactions.get(index) === true ? "bg-blue-50" : ""
                        )}
                      >
                        <td className="px-4 py-3 whitespace-nowrap sticky left-0 bg-white z-10">
                          <input
                            type="checkbox"
                            checked={selectedTransactions.get(index) === true}
                            onChange={() => toggleTransactionSelection(index)}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                            onClick={(e) => e.stopPropagation()} // Prevent row click
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" onClick={() => toggleTransactionSelection(index)}>
                          {transaction.exists ? (
                            <div className="flex items-center">
                              {transaction.matchType === 'exact' ? (
                                <CheckCircle className="h-5 w-5 text-green-500 mr-1" />
                              ) : (
                                <AlertCircle className="h-5 w-5 text-yellow-500 mr-1" />
                              )}
                              <span className={cn(
                                "text-xs px-2 py-1 rounded-full",
                                transaction.matchType === 'exact' 
                                  ? "bg-green-100 text-green-800" 
                                  : "bg-yellow-100 text-yellow-800"
                              )}>
                                {transaction.matchType === 'exact' ? 'Exists' : 'Probable Match'}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center">
                              <XCircle className="h-5 w-5 text-blue-500 mr-1" />
                              <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                                New
                              </span>
                            </div>
                          )}
                        </td>
                        
                        {/* Map through the tableFields to create selectable cells */}
                        {tableFields.filter(field => !field.isHidden).map((field: TableField) => {
                          // Determine the appropriate value for each cell based on field type
                          let cellValue: React.ReactNode = '-';
                          
                          if (field.id === "id") {
                            const transactionIdValue = transaction[field.dataField as keyof ProcessedTransaction];
                            const shopifyIdValue = field.shopifyField ? transaction[field.shopifyField] : null;
                            cellValue = (transaction['Payment method'] === 'Shopify' && shopifyIdValue) 
                              ? String(shopifyIdValue) 
                              : String(transactionIdValue || '-');
                          } else if (field.id === "date") {
                            cellValue = transaction.Date ? new Date(transaction.Date).toLocaleDateString() : '-';
                          } else if (field.id === "transactionType") {
                            // Determine transaction type based on the criteria provided
                            if (transaction.Client) {
                              // Training sessions always have a value in the "Client" column
                              cellValue = (
                                <div className="flex items-center gap-1">
                                  <span className="px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-800 border border-green-200">
                                    Sale
                                  </span>
                                  <span className="px-2 py-1 text-xs font-medium rounded-md bg-purple-100 text-purple-800 border border-purple-200">
                                    Training
                                  </span>
                                </div>
                              );
                            } else if (
                              // Check if any expense column has a value
                              (transaction['Wholesale cost'] && Number(transaction['Wholesale cost']) > 0) ||
                              (transaction['Software cost'] && Number(transaction['Software cost']) > 0) ||
                              (transaction['Ads cost'] && Number(transaction['Ads cost']) > 0) ||
                              (transaction['Equipment cost'] && Number(transaction['Equipment cost']) > 0) ||
                              (transaction['Miscellaneous expense'] && Number(transaction['Miscellaneous expense']) > 0) ||
                              (transaction['Print media expense'] && Number(transaction['Print media expense']) > 0) ||
                              (transaction['Space rental cost'] && Number(transaction['Space rental cost']) > 0) ||
                              (transaction['Pawsability rent'] && Number(transaction['Pawsability rent']) > 0)
                            ) {
                              cellValue = (
                                <span className="px-2 py-1 text-xs font-medium rounded-md bg-red-100 text-red-800 border border-red-200">
                                  Purchase
                                </span>
                              );
                            } else {
                              cellValue = (
                                <span className="px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-800 border border-green-200">
                                  Sale
                                </span>
                              );
                            }
                          } else if (field.id === "customer") {
                            const mainValue = transaction[field.dataField as keyof ProcessedTransaction];
                            const altValue = field.altField ? transaction[field.altField] : null;
                            cellValue = String(mainValue || altValue || '-');
                          } else if (field.id === "client") {
                            cellValue = String(transaction.Client || '-');
                          } else if (field.id === "supplierOrderNumber") {
                            cellValue = String(transaction['Supplier order #'] || '-');
                          } else if (field.id === "revenue") {
                            const value = typeof transaction.Revenue === 'number' && transaction.Revenue > 0
                              ? Number(transaction.Revenue)
                              : 0;
                            
                            if (editingAmount && editingAmount.index === index && editingAmount.field === 'Revenue') {
                              cellValue = (
                                <input
                                  type="text"
                                  value={editingAmount.value}
                                  onChange={(e) => setEditingAmount({...editingAmount, value: e.target.value})}
                                  onKeyDown={saveEditedAmount}
                                  className="w-full border border-blue-300 rounded px-2 py-1"
                                  autoFocus
                                />
                              );
                            } else {
                              cellValue = (
                                <div 
                                  className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded" 
                                  onClick={() => handleEditAmount(index, 'Revenue', value)}
                                >
                                  {value ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value) : '-'}
                                </div>
                              );
                            }
                          } else if (field.id === "wholesaleCost") {
                            const value = typeof transaction['Wholesale cost'] === 'number' && transaction['Wholesale cost'] > 0
                              ? Number(transaction['Wholesale cost'])
                              : 0;
                            
                            if (editingAmount && editingAmount.index === index && editingAmount.field === 'Wholesale cost') {
                              cellValue = (
                                <input
                                  type="text"
                                  value={editingAmount.value}
                                  onChange={(e) => setEditingAmount({...editingAmount, value: e.target.value})}
                                  onKeyDown={saveEditedAmount}
                                  className="w-full border border-blue-300 rounded px-2 py-1"
                                  autoFocus
                                />
                              );
                            } else {
                              cellValue = (
                                <div 
                                  className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded" 
                                  onClick={() => handleEditAmount(index, 'Wholesale cost', value)}
                                >
                                  {value ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value) : '-'}
                                </div>
                              );
                            }
                          } else if (field.id === "expenseTypeAmount") {
                            // Check all expense fields and collect all expenses with values
                            const expenseFields = [
                              { field: 'Wholesale cost', label: 'Wholesale', category: 'inventory' },
                              { field: 'Software cost', label: 'Software', category: 'software' },
                              { field: 'Ads cost', label: 'Ads', category: 'advertising' },
                              { field: 'Equipment cost', label: 'Equipment', category: 'equipment' },
                              { field: 'Miscellaneous expense', label: 'Misc', category: 'other' },
                              { field: 'Print media expense', label: 'Print Media', category: 'advertising' },
                              { field: 'Shipping cost', label: 'Shipping', category: 'shipping' },
                              { field: 'Transit cost', label: 'Transit', category: 'transit' },
                              { field: 'Dry ice cost', label: 'Dry Ice', category: 'supplies' },
                              { field: 'Packaging cost', label: 'Packaging', category: 'supplies' },
                              { field: 'Space rental cost', label: 'Space Rental', category: 'rent' },
                              { field: 'Pawsability rent', label: 'Pawsability Rent', category: 'rent' },
                              { field: 'Other cost', label: 'Other', category: 'other' }
                            ];
                            
                            // Collect all expenses with values
                            const validExpenses = expenseFields
                              .map(expense => {
                                const value = transaction[expense.field as keyof ProcessedTransaction];
                                if (typeof value === 'number' && value > 0) {
                                  return {
                                    label: expense.label,
                                    value,
                                    formatted: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
                                  };
                                }
                                return null;
                              })
                              .filter(expense => expense !== null);
                            
                            if (validExpenses.length === 0) {
                              cellValue = '-';
                            } else if (validExpenses.length === 1) {
                              // Only one expense, display it directly
                              const expense = validExpenses[0]!;
                              cellValue = (
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium">{expense.label}</span>
                                  <span className="text-xs">{expense.formatted}</span>
                                </div>
                              );
                            } else {
                              // Multiple expenses, show first one with a dropdown
                              const firstExpense = validExpenses[0]!;
                              
                              cellValue = (
                                <div className="relative group">
                                  <div className="flex flex-col">
                                    <span className="text-xs font-medium">{firstExpense.label}</span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs">{firstExpense.formatted}</span>
                                      <span className="text-xs text-blue-500 hover:text-blue-700 cursor-pointer">
                                        +{validExpenses.length - 1} more
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {/* Dropdown for additional expenses */}
                                  <div className="absolute left-0 mt-1 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 p-2 hidden group-hover:block z-20">
                                    <div className="text-xs font-semibold mb-1 text-gray-700">All Expenses:</div>
                                    {validExpenses.map((expense, expIndex) => (
                                      <div key={expIndex} className="flex justify-between items-center py-1 text-xs">
                                        <span className="font-medium">{expense.label}:</span>
                                        <span>{expense.formatted}</span>
                                      </div>
                                    ))}
                                    <div className="border-t border-gray-200 mt-1 pt-1">
                                      <div className="flex justify-between items-center py-1 text-xs font-semibold">
                                        <span>Total:</span>
                                        <span>
                                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                                            validExpenses.reduce((sum, exp) => sum + exp.value, 0)
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                          } else {
                            cellValue = String(transaction[field.dataField as keyof ProcessedTransaction] || '-');
                          }
                          
                          // Create the cell with selection capability
                          return (
                            <td 
                              key={`${index}-${field.id}`}
                              className={cn(
                                "px-4 py-3 whitespace-nowrap text-sm",
                                field.id === "revenue" ? "font-medium" : "",
                                field.id === "description" ? "truncate max-w-xs" : "whitespace-nowrap"
                              )}
                              onClick={() => field.id !== "revenue" && field.id !== "wholesaleCost" && toggleTransactionSelection(index)}
                            >
                              {cellValue}
                            </td>
                          );
                        })}
                        
                        <td className="px-4 py-3 whitespace-nowrap sticky right-0 bg-white z-10">
                          <Button
                            size="sm"
                            variant={transaction.exists ? "outline" : "default"}
                            disabled={transaction.exists || isCommitting}
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent row click
                              handleCommitSingle(index);
                            }}
                            className="w-24"
                          >
                            {isCommitting ? (
                              <div className="flex items-center justify-center w-full">
                                <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2"></div>
                                <span>Saving</span>
                              </div>
                            ) : transaction.exists ? (
                              <span>Committed</span>
                            ) : (
                              <span>Commit</span>
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {/* Show message when there are no transactions */}
                    {processedTransactions.length === 0 && (
                      <tr>
                        <td colSpan={tableFields.filter(field => !field.isHidden).length + 3} className="px-4 py-6 text-center text-sm text-gray-500">
                          No transactions to review. Please upload an Excel file with transaction data.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="list">
            <TransactionsList />
          </TabsContent>
        </Tabs>
        
        {/* Modified Dialog for field preview with product matching */}
        <Dialog open={fieldSelectionOpen} onOpenChange={setFieldSelectionOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Confirm Selected Fields</DialogTitle>
              <DialogDescription>
                {transactionToCommit !== null ? (
                  <>
                    The following fields will be saved to MongoDB. 
                    {(() => {
                      if (!transactionToCommit) return true;
                      const transactionIndex = processedTransactions.findIndex(t => 
                        t['Transaction ID'] === transactionToCommit['Transaction ID']
                      );
                      return selectedCells.filter(cell => cell.rowIndex === transactionIndex).length === 0;
                    })() && " No fields were explicitly selected, so defaults are shown."}
                  </>
                ) : (
                  "Choose which fields you want to include when committing transactions to MongoDB."
                )}
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4 overflow-y-auto">
              <div className="rounded-md border">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                        Field
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-2/3">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {getFieldsPreview(transactionToCommit !== null ? getTransactionByRef(transactionToCommit) : null).map((field: { id: string; label: string; value: React.ReactNode; originalData?: string }) => (
                      <tr key={field.id}>
                        <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">{field.label}</td>
                        <td className="px-4 py-2 text-sm break-words" style={{ maxWidth: '20rem', wordBreak: 'break-word' }}>
                          {field.id === "description" && field.originalData ? (
                            <div className="space-y-2">
                              {(() => {
                                try {
                                  // Try to parse the Products JSON
                                  const productsObj = parseProductsJson(field.originalData as string);
                                  
                                  if (Object.keys(productsObj).length === 0) {
                                    return <div className="text-gray-500">No product data found or invalid format</div>;
                                  }
                                  
                                  return Object.entries(productsObj).map(([productName, quantity], idx) => {
                                    // Add explicit type annotations
                                    let productNameStr = productName;
                                    let quantityNum = Number(quantity);
                                    let productSpend = 0;
                                    let displayQuantity = "";
                                    
                                    // Handle both simple and detailed formats for products
                                    if (typeof quantity === 'object' && quantity !== null && ('count' in quantity || 'qty' in quantity)) {
                                      // For detailed format with name, count/qty, spend
                                      const detailedData = quantity as {name?: string; count?: string | number; qty?: string | number; spend?: string | number};
                                      
                                      // Use count if available, otherwise try qty as fallback
                                      if ('count' in detailedData) {
                                        quantityNum = typeof detailedData.count === 'string' ? parseFloat(detailedData.count) : Number(detailedData.count);
                                        displayQuantity = detailedData.count ? String(detailedData.count) : "";
                                      } else if ('qty' in detailedData) {
                                        quantityNum = typeof detailedData.qty === 'string' ? parseFloat(detailedData.qty) : Number(detailedData.qty);
                                        displayQuantity = detailedData.qty ? String(detailedData.qty) : "";
                                      }
                                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                      productSpend = typeof detailedData.spend === 'string' ? parseFloat(detailedData.spend as string) : Number(detailedData.spend || 0);
                                      // If there's a name in the detailed data, use that
                                      if (detailedData.name) {
                                        productNameStr = detailedData.name;
                                      }
                                    } else {
                                      // For simple format with just quantities
                                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                      quantityNum = typeof quantity === 'string' ? parseFloat(quantity) : Number(quantity);
                                      displayQuantity = typeof quantity === 'string' ? quantity : String(quantity || '');
                                    }
                                    
                                    // Check if we have a manual match or try to find an automatic match
                                    const manualMatchId = manualMatches[productNameStr];
                                    let matchedProduct: MongoProduct | null = null;
                                    
                                    // Find potential matches for the product
                                    const potentialMatches = mongoProducts
                                      .map(p => ({
                                        product: p,
                                        score: calculateSimilarityScore(p.name, productNameStr)
                                      }))
                                      .filter(item => item.score > 20) // Only consider products with a reasonable match score
                                      .sort((a, b) => b.score - a.score); // Sort by score (highest first)
                                    
                                    if (manualMatchId && manualMatchId !== 'override') {
                                      // Find the product in MongoDB products
                                      matchedProduct = mongoProducts.find(p => p._id === manualMatchId || p.id === manualMatchId) ?? null;
                                    } else if (manualMatchId !== 'override' && potentialMatches.length > 0 && potentialMatches[0].score >= 40) {
                                      // If we have a good candidate (score >= 40), select it initially
                                      matchedProduct = potentialMatches[0].product;
                                    }
                                    
                                    return (
                                      <div key={idx} className="p-3 border rounded-md bg-gray-50">
                                        <div className="flex flex-col mb-2">
                                          <span className="font-medium text-gray-700">
                                            Excel Product: {productName}
                                            {displayQuantity && <span className="text-gray-600 ml-1">(x{displayQuantity})</span>}
                                          </span>
                                        </div>
                                        
                                        {/* Show currently matched product */}
                                        {matchedProduct && (
                                          <div className="p-2 bg-emerald-50 rounded mb-2 border border-emerald-200">
                                            <div className="flex justify-between items-center">
                                              <div className="font-medium text-gray-800">
                                                <span className="text-emerald-600">✓</span> {matchedProduct.name}
                                              </div>
                                              
                                              {/* Display price info for the product */}
                                              <div className="text-sm flex items-center space-x-2">
                                                <span className="text-gray-600">
                                                  Unit: {formatCurrency(matchedProduct?.price ? Number(matchedProduct.price) : 0)}
                                                </span>
                                                <span className="text-gray-600">
                                                  Total: {formatCurrency(Number(matchedProduct?.price || 0) * Number(displayQuantity || 0))}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                        
                                        {/* Product matching controls */}
                                        <div className="flex gap-2 justify-between items-center mb-2">
                                          <div className="flex-1">
                                            <input
                                              type="text"
                                              placeholder="Search for products..."
                                              className="input input-sm w-full border rounded p-1 text-sm"
                                              onChange={(e) => handleProductSearch(e.target.value)}
                                            />
                                          </div>
                                          
                                          <button
                                            className="px-2 py-1 bg-gray-200 rounded text-xs"
                                            onClick={() => setProductMatch(productName, 'override')}
                                          >
                                            No Match
                                          </button>
                                        </div>
                                        
                                        {/* Product search results */}
                                        <div className="mb-2">
                                          {isLoadingProducts ? (
                                            <div className="text-center py-1">
                                              <span className="text-xs text-gray-500">Loading...</span>
                                            </div>
                                          ) : (
                                            <div className="flex flex-wrap gap-1">
                                              {suggestedProducts.slice(0, 5).map((product) => (
                                                <button
                                                  key={product._id}
                                                  className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded max-w-[150px] truncate"
                                                  onClick={() => setProductMatch(productName, product._id)}
                                                >
                                                  {product.name}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        
                                        {/* Alternative matches with previous styling */}
                                        {potentialMatches.length > 0 && (
                                          <div className="mt-2">
                                            <div className="text-sm font-medium text-gray-700 mb-1">
                                              {matchedProduct ? 'Alternative Matches:' : 'Potential Matches:'}
                                            </div>
                                            <div className="space-y-1">
                                              {potentialMatches.map((match, mIdx) => (
                                                <div 
                                                  key={mIdx}
                                                  className={`
                                                    p-1.5 border rounded flex justify-between items-center cursor-pointer hover:bg-gray-100
                                                    ${match.product._id === manualMatchId ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}
                                                  `}
                                                  onClick={() => setProductMatch(productName, match.product._id)}
                                                >
                                                  <div className="font-medium text-gray-800">{match.product.name}</div>
                                                  <div className="flex items-center">
                                                    <span className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                                                      {match.score.toFixed(0)}%
                                                    </span>
                                                    <button
                                                      className="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded hover:bg-blue-600"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setProductMatch(productName, match.product._id);
                                                      }}
                                                    >
                                                      Choose
                                                    </button>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  });
                                } catch (e) {
                                  console.error("Error processing products data:", e);
                                  return <div className="text-red-500">Error processing product data</div>;
                                }
                              })()}
                            </div>
                          ) : (
                            field.value
                          )}
                        </td>
                      </tr>
                    ))}
                    {getFieldsPreview(transactionToCommit !== null ? getTransactionByRef(transactionToCommit) : null).length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-4 py-4 text-center text-sm text-gray-500">
                          No fields selected. Please select at least one field.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="mt-2 text-xs text-gray-500">
                <p>Tip: Click on cells in the table to add or remove fields from this selection.</p>
              </div>
            </div>
            
            <DialogFooter className="mt-2">
              <Button variant="outline" onClick={() => setFieldSelectionOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCommitWithSelectedFields}
                className="ml-2"
                disabled={getFieldsPreview(transactionToCommit !== null ? getTransactionByRef(transactionToCommit) : null).length === 0}
              >
                Commit to MongoDB
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Commit Dialog */}
        {showCommitDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  {transactionToSubmit && 'type' in transactionToSubmit && 
                   (transactionToSubmit.type === 'purchase' ? 
                    'Commit Expense to MongoDB' : 
                    (transactionToSubmit.type === 'training' ? 
                     'Commit Training Transaction to MongoDB' : 
                     'Commit Sale to MongoDB'))}
                </h2>
                <button 
                  onClick={() => setShowCommitDialog(false)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Close dialog"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {transactionToCommit !== null && (
                <div key={`transaction-preview-${forceUpdate}`}>
                  <div className="border border-gray-200 rounded-lg p-4 mb-4">
                    <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">
                      Transaction Preview
                    </h3>
                    {/* Display fields preview with labels */}
                    <div className="space-y-2">
                      {/* Always regenerate the fields preview to ensure it has the latest data */}
                      {transactionToCommit !== null && 
                        getFieldsPreview(getTransactionByRef(transactionToCommit)).map((field) => (
                          <div key={`${field.id}-${forceUpdate}`} className="flex flex-col">
                            <span className="text-sm font-medium text-gray-700">{field.label}:</span>
                            <div className="ml-2">{field.value}</div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                  
                  {/* Add purchase category selector for purchases */}
                  {transactionToSubmit && 'type' in transactionToSubmit && transactionToSubmit.type === 'purchase' && (
                    <div className="border border-gray-200 rounded-lg p-4 mb-4">
                      <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">
                        Purchase Options
                      </h3>
                      <div className="space-y-4">
                        <div className="flex flex-col">
                          <label className="text-sm font-medium text-gray-700 mb-1">
                            Purchase Category:
                          </label>
                          <select
                            value={(transactionToSubmit.purchaseCategory as string) || 'inventory'}
                            onChange={(e) => {
                              // Update transactionToSubmit with the new purchase category
                              setTransactionToSubmit(prev => ({
                                ...prev,
                                purchaseCategory: e.target.value.toLowerCase()
                              }));
                              // Force update to refresh UI
                              forceRerender();
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="inventory">Inventory</option>
                            <option value="supplies">Supplies</option>
                            <option value="equipment">Equipment</option>
                            <option value="software">Software</option>
                            <option value="advertising">Advertising</option>
                            <option value="shipping">Shipping</option>
                            <option value="rent">Rent</option>
                            <option value="utilities">Utilities</option>
                            <option value="transit">Transit</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => setShowCommitDialog(false)}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={finalizeTransactionCommit}
                      className="px-4 py-2 bg-emerald-600 rounded-md text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Commit to MongoDB
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Product Match Dialog */}
      <Dialog open={showProductMatchDialog} onOpenChange={setShowProductMatchDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Match Product</DialogTitle>
            <DialogDescription>
              {currentUnmatchedProduct ? 
                `Select a matching product from the database for "${currentUnmatchedProduct.productName}"` : 
                'Match products to database records'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {currentUnmatchedProduct && (
              <>
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Product to Match:</Label>
                  <span className="text-lg">{currentUnmatchedProduct.productName}</span>
                </div>
                
                <div className="space-y-4">
                  <Label>Search for matching product:</Label>
                  <div className="flex gap-2">
                    <Input 
                      type="text" 
                      placeholder="Type to search..." 
                      value={_productSearchTerm}
                      onChange={(e) => {
                        const searchTerm = e.target.value;
                        setProductSearchTerm(searchTerm);
                        // If term is empty, clear results instead of searching
                        if (!searchTerm || searchTerm.length < 2) {
                          setSuggestedProducts([]);
                        } else {
                          handleProductSearch(searchTerm);
                        }
                      }}
                      className="flex-1"
                      autoFocus
                    />
                  </div>
                  
                  {isLoadingProducts && (
                    <div className="flex justify-center p-4">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  )}
                  
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product Name</TableHead>
                          <TableHead>Retail Price</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {suggestedProducts.length > 0 ? (
                          suggestedProducts.map((product) => (
                            <TableRow key={product._id}>
                              <TableCell>{product.name}</TableCell>
                              <TableCell>{formatCurrency(product.price)}</TableCell>
                              <TableCell>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleProductMatch(product._id)}
                                >
                                  Select
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-4">
                              No matching products found. Try a different search term.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductMatchDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 