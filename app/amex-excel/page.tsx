'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UploadCloud, AlertCircle, FileSpreadsheet, Loader2, Download, CheckCircle2, Check, ArrowUpCircle, Trash2 } from "lucide-react"
import { formatNumberWithCommas } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface AmexTransaction {
  date: string
  description: string
  amount: number
  category?: string
  cardNumber?: string
  reference?: string
  extendedDetails?: string
  address?: string
  cityState?: string
  zipCode?: string
  country?: string
}

interface MatchedTransaction {
  reference?: string;
  match: {
    id?: string;
    _id: string;
    date: string;
    amount: number;
    type: string;
    description?: string;
  };
}

// Define the useClosableMenu hook for the template menu
const useClosableMenu = (menuId: string) => {
  // Close the menu when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const menu = document.getElementById(menuId);
      if (menu && !menu.contains(e.target as Node)) {
        menu.classList.add('hidden');
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [menuId]);

  // Toggle function
  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const menu = document.getElementById(menuId);
    if (menu) {
      menu.classList.toggle('hidden');
    }
  };

  return toggleMenu;
};

export default function AmexExcelPage() {
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<AmexTransaction[]>([])
  const [importedTransactions, setImportedTransactions] = useState<string[]>([])
  const [selectedTransactions, setSelectedTransactions] = useState<Set<number>>(new Set());
  const [isCommitting, setIsCommitting] = useState(false);
  const [committingTransaction, setCommittingTransaction] = useState<AmexTransaction | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCommittingSingle, setIsCommittingSingle] = useState(false);
  const [existingTransactions, setExistingTransactions] = useState<Set<string>>(new Set());
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  
  // New state for editable MongoDB document
  const [editableDocument, setEditableDocument] = useState<Record<string, unknown>>({});
  const [documentFields, setDocumentFields] = useState<{key: string, value: unknown}[]>([]);
  
  const headerRef = useRef<HTMLDivElement>(null);

  // Check for existing transactions in MongoDB when transactions change
  useEffect(() => {
    const checkExistingTransactions = async () => {
      if (transactions.length === 0) return;
      
      setIsCheckingExisting(true);
      console.log('Checking for existing MongoDB transactions...');
      
      try {
        const response = await fetch('/api/transactions/check-existing', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ transactions }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to check existing transactions');
        }
        
        const data = await response.json();
        console.log('Response from check-existing API:', data);
        
        if (data.existingTransactions && Array.isArray(data.existingTransactions)) {
          // Create a Set of reference IDs for transactions that already exist
          const existingSet = new Set<string>();
          data.existingTransactions.forEach((match: MatchedTransaction) => {
            if (match.reference) {
              existingSet.add(match.reference);
            }
          });
          
          setExistingTransactions(existingSet);
          
          if (existingSet.size > 0) {
            console.log(`Found ${existingSet.size} transactions that already exist in MongoDB:`);
            console.log(Array.from(existingSet));
            
            // Find the matching AMEX transactions that were found in MongoDB
            const matchedAmexTransactions = transactions.filter(
              tx => tx.reference && existingSet.has(tx.reference)
            );
            
            if (matchedAmexTransactions.length > 0) {
              console.log('First matched AMEX transaction:');
              console.log(matchedAmexTransactions[0]);
            }
          }
        }
      } catch (err) {
        console.error('Error checking existing transactions:', err);
      } finally {
        setIsCheckingExisting(false);
      }
    };
    
    checkExistingTransactions();
  }, [transactions]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const uploadedFile = files[0]
      if (uploadedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
          uploadedFile.type === 'application/vnd.ms-excel' ||
          uploadedFile.name.endsWith('.xlsx') || 
          uploadedFile.name.endsWith('.xls')) {
        setFile(uploadedFile)
        handleFileUpload(uploadedFile)
      } else {
        setError('Please upload an Excel file (.xlsx or .xls)')
      }
    }
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const uploadedFile = e.target.files[0]
      if (uploadedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
          uploadedFile.type === 'application/vnd.ms-excel' ||
          uploadedFile.name.endsWith('.xlsx') || 
          uploadedFile.name.endsWith('.xls')) {
        setFile(uploadedFile)
        handleFileUpload(uploadedFile)
      } else {
        setError('Please upload an Excel file (.xlsx or .xls)')
      }
    }
  }, [])

  const handleFileUpload = async (fileToUpload: File) => {
    setIsUploading(true)
    setError(null)
    setTransactions([])

    console.log('Debug: Starting file upload for:', fileToUpload.name, 'Size:', fileToUpload.size)

    try {
      // Create form data object
      const formData = new FormData()
      formData.append('file', fileToUpload)

      console.log('Debug: Sending file to API')
      
      // Upload file to API endpoint
      const response = await fetch('/api/amex-excel/parse', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Debug: API Error response:', errorData)
        throw new Error(errorData.message || 'Failed to parse Excel file')
      }

      const data = await response.json()
      console.log('Debug: API Success response:', data)
      console.log('Debug: Transactions received:', data.transactions?.length || 0)
      
      if (data.transactions && Array.isArray(data.transactions)) {
        setTransactions(data.transactions)
        console.log('Debug: State updated with transactions')
      } else {
        console.error('Debug: Invalid transactions data received:', data.transactions)
        setError('Invalid data received from server')
      }
    } catch (err) {
      console.error('Debug: Error during file upload:', err)
      setError(err instanceof Error ? err.message : 'Failed to parse Excel file')
    } finally {
      setIsUploading(false)
      console.log('Debug: File upload process completed')
    }
  }

  // Add downloadCSV function
  const downloadCSV = useCallback(() => {
    if (transactions.length === 0) return;

    // CSV headers
    const headers = [
      'Date',
      'Description',
      'Amount',
      'Category',
      'Card Number',
      'Reference',
      'Extended Details',
      'Address',
      'City/State',
      'Zip Code',
      'Country'
    ];

    // CSV rows
    const rows = transactions.map(transaction => [
      transaction.date,
      `"${(transaction.description || '').replace(/"/g, '""')}"`, // Escape quotes in description
      transaction.amount,
      `"${(transaction.category || '').replace(/"/g, '""')}"`,
      transaction.cardNumber || '',
      transaction.reference || '',
      `"${(transaction.extendedDetails || '').replace(/"/g, '""')}"`,
      `"${(transaction.address || '').replace(/"/g, '""')}"`,
      `"${(transaction.cityState || '').replace(/"/g, '""')}"`,
      transaction.zipCode || '',
      transaction.country || ''
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create a blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'amex_transactions.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [transactions]);

  // Add importTransactions function
  const importTransactions = useCallback(async () => {
    if (transactions.length === 0) return;
    
    setIsImporting(true);
    
    try {
      const response = await fetch('/api/transactions/import-amex', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactions }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to import transactions');
      }
      
      const data = await response.json();
      
      // Update imported transactions
      setImportedTransactions(data.importedIds || []);
      
      toast({
        title: "Transactions Imported",
        description: `Successfully imported ${data.importedCount} transactions`,
        variant: "default",
      });
    } catch (err) {
      console.error('Error importing transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to import transactions');
      
      toast({
        title: "Import Failed",
        description: err instanceof Error ? err.message : 'Failed to import transactions',
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  }, [transactions, toast]);

  // Handler for selecting/deselecting individual transactions
  const toggleTransactionSelection = useCallback((index: number) => {
    setSelectedTransactions(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(index)) {
        newSelection.delete(index);
      } else {
        newSelection.add(index);
      }
      return newSelection;
    });
  }, []);

  // Handler for selecting/deselecting all transactions
  const toggleSelectAll = useCallback(() => {
    if (selectedTransactions.size === transactions.length) {
      // If all are selected, clear selection
      setSelectedTransactions(new Set());
    } else {
      // Otherwise select all
      const allIndices = new Set(transactions.map((_, index) => index));
      setSelectedTransactions(allIndices);
    }
  }, [transactions, selectedTransactions]);

  // Function to commit only selected transactions
  const commitSelectedTransactions = useCallback(async () => {
    if (selectedTransactions.size === 0) {
      toast({
        title: "No Transactions Selected",
        description: "Please select at least one transaction to commit",
        variant: "destructive",
      });
      return;
    }

    setIsCommitting(true);
    
    try {
      // Filter out only the selected transactions
      const transactionsToCommit = Array.from(selectedTransactions)
        .map(index => transactions[index])
        .filter(Boolean);
      
      const response = await fetch('/api/transactions/import-amex', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactions: transactionsToCommit,
          isCommit: true // Flag to indicate this is a commit operation
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to commit transactions');
      }
      
      const data = await response.json();
      
      // Update imported transactions
      setImportedTransactions(prev => {
        const newImported = new Set(prev);
        (data.importedIds || []).forEach((id: string) => newImported.add(id));
        return Array.from(newImported);
      });
      
      toast({
        title: "Transactions Committed",
        description: `Successfully committed ${data.importedCount} transactions`,
        variant: "default",
      });
    } catch (err) {
      console.error('Error committing transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to commit transactions');
      
      toast({
        title: "Commit Failed",
        description: err instanceof Error ? err.message : 'Failed to commit transactions',
        variant: "destructive",
      });
    } finally {
      setIsCommitting(false);
    }
  }, [transactions, selectedTransactions, toast]);

  // Open dialog for single transaction commit with editable document
  const openCommitDialog = useCallback((transaction: AmexTransaction) => {
    setCommittingTransaction(transaction);

    // Generate MongoDB document structure
    const transactionDate = new Date(transaction.date);
    const now = new Date().toISOString();
    
    // Always use 'purchase' as the transaction type
    const transactionType = 'purchase';
    
    // Create initial document structure that matches exactly what will be sent to MongoDB
    const initialDocument = {
      date: transactionDate.toISOString(),
      amount: Math.abs(transaction.amount),
      type: transactionType,
      paymentMethod: "AMEX",
      vendor: transaction.description,
      purchaseCategory: "inventory", // Add default purchaseCategory
      // Use supplierOrderNumber for storing reference
      supplierOrderNumber: transaction.reference || undefined,
      createdAt: now,
      updatedAt: now
    };
    
    // Filter out undefined values
    const cleanDocument = Object.fromEntries(
      Object.entries(initialDocument).filter(([, value]) => value !== undefined)
    );
    
    setEditableDocument(cleanDocument);
    
    // Convert to array of key-value pairs for editing
    const fields = Object.entries(cleanDocument).map(([key, value]) => ({
      key,
      value: value
    }));
    
    setDocumentFields(fields);
    setIsDialogOpen(true);
  }, []);
  
  // Update field key
  const updateFieldKey = (index: number, newKey: string) => {
    const updatedFields = [...documentFields];
    updatedFields[index] = { ...updatedFields[index], key: newKey };
    setDocumentFields(updatedFields);
    
    // Update editable document
    updateEditableDocument(updatedFields);
  };
  
  // Update field value with proper type conversion
  const updateFieldValue = (index: number, newValue: string) => {
    const updatedFields = [...documentFields];
    
    // Try to parse the value to the appropriate type
    const parsedValue = parseValueByContent(newValue);
    
    updatedFields[index] = { ...updatedFields[index], value: parsedValue };
    setDocumentFields(updatedFields);
    
    // Update editable document
    updateEditableDocument(updatedFields);
  };
  
  // Helper to format a value for display in the input
  const formatValueForDisplay = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    
    // For objects and arrays, pretty-print them
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    
    // For dates, show ISO format
    if (value instanceof Date) {
      return value.toISOString();
    }
    
    // For everything else, convert to string
    return String(value);
  };
  
  // Parse a string value to the appropriate type based on its content
  const parseValueByContent = (value: string): unknown => {
    // If empty, return empty string
    if (value.trim() === '') return '';
    
    // Try to parse as number
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return Number(value);
    }
    
    // Check for boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Check for null
    if (value.toLowerCase() === 'null') return null;
    
    // Check for ISO date format
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
      return new Date(value);
    }
    
    // Try to parse as JSON for objects and arrays
    try {
      if ((value.startsWith('{') && value.endsWith('}')) || 
          (value.startsWith('[') && value.endsWith(']'))) {
        return JSON.parse(value);
      }
    } catch {
      // If parsing fails, return as string
    }
    
    // Default to string
    return value;
  };
  
  // Add new field
  const addField = () => {
    setDocumentFields([...documentFields, { key: '', value: '' }]);
  };
  
  // Remove field
  const removeField = (index: number) => {
    const updatedFields = [...documentFields];
    updatedFields.splice(index, 1);
    setDocumentFields(updatedFields);
    
    // Update editable document
    updateEditableDocument(updatedFields);
  };
  
  // Update the editable document from fields
  const updateEditableDocument = (fields: {key: string, value: unknown}[]) => {
    const newDocument: Record<string, unknown> = {};
    
    fields.forEach(field => {
      if (field.key.trim() !== '') {
        newDocument[field.key] = field.value;
      }
    });
    
    setEditableDocument(newDocument);
  };

  // Add validation for required fields and return validation errors
  const validateDocument = (doc: Record<string, unknown>): string[] => {
    const errors: string[] = [];
    
    // Check required fields based on Prisma schema
    if (!doc.date) errors.push('Field "date" is required');
    if (doc.amount === undefined || doc.amount === null) errors.push('Field "amount" is required');
    if (!doc.type) errors.push('Field "type" is required');
    
    // Validate field types
    if (doc.date && !(doc.date instanceof Date) && typeof doc.date !== 'string') {
      errors.push('Field "date" must be a Date or ISO string');
    }
    
    if (doc.amount !== undefined && typeof doc.amount !== 'number') {
      errors.push('Field "amount" must be a number');
    }
    
    if (doc.type && typeof doc.type !== 'string') {
      errors.push('Field "type" must be a string');
    }
    
    return errors;
  };

  // Get a display friendly type for a value
  const getTypeDisplay = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
      // Check if it's a date string
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
        return 'date (string)';
      }
      return 'string';
    }
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return typeof value;
  };

  // Get a color for the type indicator
  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'string': return 'text-blue-600';
      case 'date (string)': 
      case 'date': return 'text-purple-600';
      case 'number': return 'text-green-600';
      case 'boolean': return 'text-amber-600';
      case 'null': return 'text-gray-500';
      case 'array': 
      case 'object': return 'text-rose-600';
      default: return 'text-gray-600';
    }
  };

  // Update the commit function to validate before submitting
  const commitSingleTransaction = useCallback(async () => {
    if (!committingTransaction) return;
    
    // Validate document before submitting
    const validationErrors = validateDocument(editableDocument);
    
    if (validationErrors.length > 0) {
      toast({
        title: "Validation Error",
        description: `Missing required fields: ${validationErrors.join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    
    setIsCommittingSingle(true);
    
    try {
      // Create a copy of the transaction with our custom document
      const customTransaction = {
        ...committingTransaction,
        _customDocument: editableDocument // Add custom document to be used by API
      };
      
      const response = await fetch('/api/transactions/import-amex', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactions: [customTransaction],
          isCommit: true,
          useCustomDocument: true // Flag to use custom document
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to commit transaction');
      }
      
      const data = await response.json();
      
      // Update imported transactions
      setImportedTransactions(prev => {
        const newImported = new Set(prev);
        (data.importedIds || []).forEach((id: string) => newImported.add(id));
        return Array.from(newImported);
      });
      
      toast({
        title: "Transaction Committed",
        description: "Successfully committed transaction to database",
      });

      // Close dialog after success
      setIsDialogOpen(false);
    } catch (err) {
      console.error('Error committing transaction:', err);
      
      toast({
        title: "Commit Failed",
        description: err instanceof Error ? err.message : 'Failed to commit transaction',
        variant: "destructive",
      });
    } finally {
      setIsCommittingSingle(false);
    }
  }, [committingTransaction, editableDocument, toast]);

  // Define common field templates for quick adding
  const fieldTemplates = [
    { name: 'Purchase Template', fields: [
      { key: 'date', value: new Date().toISOString() },
      { key: 'amount', value: 0 },
      { key: 'type', value: 'purchase' },
      { key: 'paymentMethod', value: 'AMEX' },
      { key: 'vendor', value: '' },
      { key: 'purchaseCategory', value: 'inventory' }, // Add default purchaseCategory
      { key: 'supplierOrderNumber', value: '' },
    ]},
    { name: 'Sale Template', fields: [
      { key: 'date', value: new Date().toISOString() },
      { key: 'amount', value: 0 },
      { key: 'type', value: 'sale' },
      { key: 'paymentMethod', value: 'AMEX' },
      { key: 'customer', value: '' },
    ]},
    { name: 'Product Fields', fields: [
      { key: 'products', value: JSON.stringify([{
        productId: '',
        name: '',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0
      }]) }
    ]}
  ];

  // Apply a template to the current document fields
  const applyTemplate = (templateName: string) => {
    const template = fieldTemplates.find(t => t.name === templateName);
    if (!template) return;
    
    // Start with a fresh set of fields from the template
    const newFields = [...template.fields.map(field => ({ ...field }))];
    
    // Update fields
    setDocumentFields(newFields);
    
    // Update document
    updateEditableDocument(newFields);
  };

  // Inside the component near the template code
  const toggleTemplateMenu = useClosableMenu('template-menu');

  // Function to autofill MongoDB document from the original transaction
  const autofillFromOriginal = () => {
    if (!committingTransaction) return;
    
    const transactionDate = new Date(committingTransaction.date);
    const now = new Date().toISOString();
    
    // Always use 'purchase' for transaction type
    const transactionType = 'purchase';
    
    // Create fields based on the transaction
    const newFields = [
      { key: 'date', value: transactionDate },
      { key: 'amount', value: Math.abs(committingTransaction.amount) },
      { key: 'type', value: transactionType },
      { key: 'paymentMethod', value: 'AMEX' },
      { key: 'vendor', value: committingTransaction.description },
      { key: 'purchaseCategory', value: 'inventory' } // Add default purchaseCategory
    ];
    
    // Add optional fields if they exist
    if (committingTransaction.reference) {
      newFields.push({ key: 'supplierOrderNumber', value: committingTransaction.reference });
    }
    
    if (committingTransaction.category) {
      newFields.push({ key: 'category', value: committingTransaction.category });
    }
    
    // Add metadata fields
    newFields.push({ key: 'createdAt', value: now });
    newFields.push({ key: 'updatedAt', value: now });
    
    // Update fields
    setDocumentFields(newFields);
    
    // Update document
    updateEditableDocument(newFields);
    
    toast({
      title: "Document Autofilled",
      description: "Document fields have been populated from the original transaction.",
    });
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">AMEX Excel Statement Import</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Import AMEX Excel Statement</CardTitle>
          <CardDescription>
            Upload your AMEX statement Excel file to parse and import transactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center">
              {isUploading ? (
                <>
                  <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-4" />
                  <p className="text-sm font-medium text-gray-500">Processing your file...</p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-10 w-10 text-gray-400 mb-4" />
                  <p className="text-sm font-medium text-gray-500 mb-2">
                    Drag and drop your AMEX Excel file here, or
                  </p>
                  <label className="relative cursor-pointer bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md transition-colors">
                    <span>Browse files</span>
                    <input
                      type="file"
                      className="sr-only"
                      accept=".xlsx,.xls"
                      onChange={handleFileChange}
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center">
              <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {file && !isUploading && !error && (
            <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center">
              <FileSpreadsheet className="h-5 w-5 mr-2 flex-shrink-0" />
              <p className="text-sm">
                Successfully uploaded: <span className="font-medium">{file.name}</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {transactions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between sticky top-0 z-10 bg-white border-b shadow-sm" ref={headerRef}>
            <div>
              <CardTitle>AMEX Transactions</CardTitle>
              <CardDescription>
                {transactions.length} transactions found in the uploaded statement
                {selectedTransactions.size > 0 && ` (${selectedTransactions.size} selected)`}
                {existingTransactions.size > 0 && ` (${existingTransactions.size} already in database)`}
                {isCheckingExisting && ' - Checking for existing transactions...'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={downloadCSV} 
                className="flex items-center gap-2"
                variant="outline"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
              
              <Button 
                onClick={importTransactions} 
                className="flex items-center gap-2"
                disabled={isImporting}
                variant="outline"
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {isImporting ? "Importing All..." : "Import All"}
              </Button>
              
              <Button 
                onClick={commitSelectedTransactions} 
                className="flex items-center gap-2"
                disabled={isCommitting || selectedTransactions.size === 0}
              >
                {isCommitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {isCommitting ? "Committing..." : `Commit Selected (${selectedTransactions.size})`}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              {transactions.length === 0 ? (
                <p className="text-center py-4 text-gray-500">No transactions found in the file. Please check the file format.</p>
              ) : (
                <div className="relative">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-[124px] z-10 bg-white">
                      <tr className="bg-gray-50 border-b">
                        <th className="p-3">
                          <Checkbox 
                            id="select-all-checkbox"
                            checked={selectedTransactions.size === transactions.length && transactions.length > 0}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all transactions"
                          />
                        </th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Status</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Actions</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Date</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Description</th>
                        <th className="text-right p-3 text-sm font-medium text-gray-500">Amount</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Category</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Card #</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Reference</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-500">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((transaction, index) => {
                        // Check if transaction is imported or already exists in database
                        const isImported = importedTransactions.includes(transaction.reference || '');
                        const isExisting = transaction.reference && existingTransactions.has(transaction.reference);
                        const isSelected = selectedTransactions.has(index);
                        
                        return (
                          <tr key={index} 
                            className={`border-b hover:bg-gray-50 
                              ${isImported ? 'bg-green-50' : ''} 
                              ${isExisting ? 'bg-green-100' : ''} 
                              ${isSelected ? 'bg-blue-50' : ''}`}
                          >
                            <td className="p-3">
                              <Checkbox 
                                id={`checkbox-${index}`}
                                checked={isSelected} 
                                onCheckedChange={() => toggleTransactionSelection(index)}
                                aria-label={`Select transaction ${index}`}
                              />
                            </td>
                            <td className="p-3 text-sm">
                              {isImported && (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              )}
                              {isExisting && !isImported && (
                                <CheckCircle2 className="h-4 w-4 text-green-700" />
                              )}
                            </td>
                            <td className="p-3 text-sm">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => openCommitDialog(transaction)}
                                className="h-8 px-2 text-xs"
                                disabled={isExisting ? true : undefined}
                              >
                                <ArrowUpCircle className="h-3 w-3 mr-1" />
                                Commit
                              </Button>
                            </td>
                            <td className="p-3 text-sm">{transaction.date}</td>
                            <td className="p-3 text-sm">
                              <div className="max-w-md truncate">
                                {transaction.description}
                                {isExisting && (
                                  <span className="ml-2 text-xs text-green-700 font-semibold">(Already in database)</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-sm text-right" style={{ color: transaction.amount < 0 ? 'red' : 'inherit' }}>
                              ${formatNumberWithCommas(Math.abs(transaction.amount))}
                              {transaction.amount < 0 ? ' CR' : ''}
                            </td>
                            <td className="p-3 text-sm">{transaction.category || '-'}</td>
                            <td className="p-3 text-sm">{transaction.cardNumber || '-'}</td>
                            <td className="p-3 text-sm">{transaction.reference || '-'}</td>
                            <td className="p-3 text-sm">
                              {transaction.cityState ? 
                                `${transaction.cityState}${transaction.zipCode ? `, ${transaction.zipCode}` : ''}` : 
                                '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Commit Transaction Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Commit Transaction to MongoDB</DialogTitle>
            <DialogDescription>
              Edit the exact document that will be saved to MongoDB. Changes here will directly affect the stored document.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {committingTransaction && (
              <div className="space-y-4">
                {/* MongoDB Document Editor */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-medium">MongoDB Document Structure</h3>
                    <div className="flex gap-2">
                      <div className="relative">
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          onClick={toggleTemplateMenu}
                        >
                          Templates
                        </Button>
                        <div 
                          id="template-menu" 
                          className="absolute right-0 mt-1 w-48 bg-white border rounded-md shadow-lg z-10 hidden"
                        >
                          <div className="py-1">
                            {fieldTemplates.map((template, idx) => (
                              <button 
                                key={idx}
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                onClick={() => {
                                  applyTemplate(template.name);
                                  document.getElementById('template-menu')?.classList.add('hidden');
                                }}
                              >
                                {template.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addField}>
                        Add Field
                      </Button>
                    </div>
                  </div>
                  
                  <div className="border rounded-md p-4 bg-slate-50">
                    <div className="grid grid-cols-[minmax(120px,1fr),minmax(180px,2fr),auto] gap-2 mb-3 font-medium text-sm">
                      <div>Field Key</div>
                      <div className="flex justify-between">
                        <span>Field Value</span>
                        <span className="text-gray-500 text-xs">Type</span>
                      </div>
                      <div></div>
                    </div>
                    
                    {documentFields.map((field, index) => {
                      const typeDisplay = getTypeDisplay(field.value);
                      const typeColor = getTypeColor(typeDisplay);
                      const isRequired = ['date', 'amount', 'type'].includes(field.key);
                      
                      return (
                        <div key={index} className="grid grid-cols-[minmax(120px,1fr),minmax(180px,2fr),auto] gap-2 mb-3">
                          <div className="relative">
                            <Input 
                              value={field.key}
                              onChange={(e) => updateFieldKey(index, e.target.value)}
                              placeholder="Field name"
                              className={`text-sm font-mono ${isRequired ? 'border-orange-300' : ''}`}
                            />
                            {isRequired && (
                              <span className="absolute -top-2 -right-2 text-xs bg-orange-100 text-orange-800 px-1 rounded-sm">
                                Required
                              </span>
                            )}
                          </div>
                          <div className="relative">
                            {(typeDisplay === 'object' || typeDisplay === 'array') ? (
                              <div className="relative">
                                <textarea
                                  value={formatValueForDisplay(field.value)}
                                  onChange={(e) => updateFieldValue(index, e.target.value)}
                                  placeholder="Field value"
                                  className="w-full min-h-[80px] text-sm font-mono rounded-md border pr-16 py-2 px-3"
                                />
                                <span className={`absolute right-2 top-2 text-xs ${typeColor}`}>
                                  {typeDisplay}
                                </span>
                              </div>
                            ) : (
                              <div className="relative">
                                <Input 
                                  value={typeof field.value === 'string' ? field.value : JSON.stringify(field.value)}
                                  onChange={(e) => updateFieldValue(index, e.target.value)}
                                  placeholder="Field value"
                                  className="text-sm font-mono pr-16"
                                />
                                <span className={`absolute right-2 top-2 text-xs ${typeColor}`}>
                                  {typeDisplay}
                                </span>
                              </div>
                            )}
                          </div>
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="icon"
                            onClick={() => removeField(index)}
                            className="h-9 w-9"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                    
                    <div className="mt-4 text-xs text-slate-500">
                      <p>Note: This editor shows the exact MongoDB document structure that will be saved.</p>
                      <p className="mt-1 text-orange-600 font-medium">Required fields: date, amount, type</p>
                      <p className="mt-2">• Date fields should be in ISO format (e.g., &quot;2023-01-01T00:00:00.000Z&quot;)</p>
                      <p>• Numeric values should be entered as numbers without quotes</p>
                      <p>• For nested objects or arrays, use valid JSON syntax</p>
                    </div>
                  </div>
                  
                  {/* Raw JSON Preview */}
                  <div>
                    <h3 className="text-sm font-medium mb-2">Document Preview (JSON)</h3>
                    <div className="border rounded-md p-4 bg-slate-50">
                      <div className="font-mono text-xs bg-slate-100 p-3 rounded-md overflow-x-auto">
                        <pre className="whitespace-pre-wrap break-all">
                          {JSON.stringify(editableDocument, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Original Transaction Reference (Collapsed) */}
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-slate-100 px-4 py-2 flex justify-between items-center">
                    <h4 className="font-medium text-sm">Original AMEX Transaction (Reference Only)</h4>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm"
                      onClick={autofillFromOriginal}
                      className="h-7 text-xs gap-1"
                    >
                      <ArrowUpCircle className="h-3 w-3" />
                      Auto-fill Document
                    </Button>
                  </div>
                  <div className="p-4 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="font-medium">Date:</div>
                      <div>{committingTransaction.date}</div>
                      
                      <div className="font-medium">Description:</div>
                      <div className="truncate">{committingTransaction.description}</div>
                      
                      <div className="font-medium">Amount:</div>
                      <div style={{ color: committingTransaction.amount < 0 ? 'red' : 'inherit' }}>
                        ${formatNumberWithCommas(Math.abs(committingTransaction.amount))}
                        {committingTransaction.amount < 0 ? ' CR' : ''}
                      </div>
                      
                      <div className="font-medium">Reference:</div>
                      <div>{committingTransaction.reference || '-'}</div>
                      
                      {committingTransaction.category && (
                        <>
                          <div className="font-medium">Category:</div>
                          <div>{committingTransaction.category}</div>
                        </>
                      )}
                      
                      {committingTransaction.cardNumber && (
                        <>
                          <div className="font-medium">Card Number:</div>
                          <div>{committingTransaction.cardNumber}</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="sm:justify-between mt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={commitSingleTransaction}
              disabled={isCommittingSingle}
              className="gap-2"
            >
              {isCommittingSingle ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isCommittingSingle ? "Committing..." : "Commit to MongoDB"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 