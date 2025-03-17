import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

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

interface RawAmexRow {
  [key: string]: string | number | null | undefined
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      console.log('Debug: No file provided');
      return NextResponse.json(
        { message: 'No file provided' },
        { status: 400 }
      );
    }

    // Check if it's an Excel file
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      console.log('Debug: Invalid file format', file.name);
      return NextResponse.json(
        { message: 'Invalid file format. Please upload an Excel file (.xlsx or .xls)' },
        { status: 400 }
      );
    }

    console.log('Debug: Processing file:', file.name, 'Size:', file.size);

    // Convert the file to an array buffer
    const fileBuffer = await file.arrayBuffer();
    
    // Parse Excel file using xlsx library
    const workbook = XLSX.read(fileBuffer, { type: 'array' });
    console.log('Debug: Workbook sheets:', workbook.SheetNames);
    
    // Get the first worksheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert worksheet to JSON
    const rawData = XLSX.utils.sheet_to_json<RawAmexRow>(worksheet);
    console.log('Debug: Raw data entries:', rawData.length);
    
    if (rawData.length > 0) {
      console.log('Debug: First row keys:', Object.keys(rawData[0]));
      console.log('Debug: Sample first row:', JSON.stringify(rawData[0]).substring(0, 200) + '...');
    }
    
    // Process the data to match the expected format
    const transactions = processAmexData(rawData);
    console.log('Debug: Processed transactions:', transactions.length);
    
    if (transactions.length > 0) {
      console.log('Debug: Sample transaction:', JSON.stringify(transactions[0]));
    } else {
      console.log('Debug: No transactions processed. Check the startProcessingData flag and data format.');
    }
    
    return NextResponse.json({ 
      transactions,
      message: 'Excel file parsed successfully' 
    });
    
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    
    return NextResponse.json(
      { message: 'Failed to parse Excel file', error: (error as Error).message },
      { status: 500 }
    );
  }
}

// Helper function to process AMEX data
function processAmexData(rawData: RawAmexRow[]): AmexTransaction[] {
  const processedData: AmexTransaction[] = [];
  
  console.log('Debug: Processing AMEX data, rows:', rawData.length);

  if (rawData.length === 0) {
    console.log('Debug: No data rows to process');
    return processedData;
  }
  
  // The AMEX Excel file has header rows at the top before the actual transaction data
  // We need to find the row that contains the column headers for transactions
  
  // Step 1: Find the header row that indicates the start of transaction data
  let headerRowIndex = -1;
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const values = Object.values(row).map(v => String(v || "").toLowerCase());
    
    // Look for common header indicators in AMEX statements
    if (
      values.includes("date") || 
      (values.some(v => v.includes("date")) && values.some(v => v.includes("amount")))
    ) {
      headerRowIndex = i;
      console.log('Debug: Found potential header row at index', i, ':', JSON.stringify(row));
      break;
    }
    
    // Alternative: check if this row contains date-like string and "reference" or "description"
    const rowStr = JSON.stringify(row).toLowerCase();
    if ((rowStr.includes("date") || rowStr.includes("/20")) && 
        (rowStr.includes("reference") || rowStr.includes("description"))) {
      headerRowIndex = i;
      console.log('Debug: Found potential header row at index', i, ':', JSON.stringify(row));
      break;
    }
  }
  
  if (headerRowIndex === -1) {
    // Try another approach: look for a row with a date-like pattern
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const rowValues = Object.values(row).map(v => String(v || ""));
      
      // Check for date patterns like MM/DD/YYYY in any field
      const hasDatePattern = rowValues.some(v => v.match(/\d{1,2}\/\d{1,2}\/\d{4}/));
      
      if (hasDatePattern) {
        console.log('Debug: Found first row with date pattern at index', i, ':', JSON.stringify(row));
        
        // Use the previous row as the header if possible
        headerRowIndex = Math.max(0, i - 1);
        break;
      }
    }
  }
  
  if (headerRowIndex === -1) {
    console.log('Debug: Could not find a header row');
    return processedData;
  }
  
  // Step 2: Extract column headers from the header row
  const headerRow = rawData[headerRowIndex];
  console.log('Debug: Using header row:', JSON.stringify(headerRow));
  
  // Step 3: Map columns to standard fields
  const columnMapping: Record<string, string[]> = {
    'date': ['date', 'transaction date', 'date of transaction'],
    'description': ['description', 'merchant name', 'appears on your statement as'],
    'amount': ['amount', 'charge amount'],
    'reference': ['reference', 'reference #', 'ref #', 'transaction id'],
    'category': ['category', 'spend category'],
    'cardMember': ['card member', 'card #', 'account #'],
    'city': ['city', 'city/state', 'merchant city'],
    'state': ['state', 'merchant state'],
    'zip': ['zip', 'zip code', 'postal code'],
    'country': ['country']
  };
  
  // Find the column indices
  const mapping: Record<string, string> = {};
  
  // Loop through header row keys and values to find matches
  Object.entries(headerRow).forEach(([key, value]) => {
    const valueStr = String(value || "").toLowerCase();
    const keyLower = key.toLowerCase();
    
    // Try to match by header value first, then by key
    Object.entries(columnMapping).forEach(([field, possibleNames]) => {
      if (possibleNames.some(name => valueStr.includes(name) || keyLower.includes(name))) {
        mapping[field] = key;
      }
    });
  });
  
  console.log('Debug: Column mapping:', mapping);
  
  if (!mapping.date || !mapping.description) {
    console.log('Debug: Could not find required columns (date and description)');
    
    // Special case: check if AMEX Excel has specific structure with long header names
    // Some AMEX exports have transaction data in rows but with specific format
    if (rawData[0] && 
        Object.keys(rawData[0]).some(k => k.includes("Transaction Details"))) {
      console.log('Debug: Detected AMEX specific format with Transaction Details column');
      
      // For this specific format, we need a different parsing approach
      return parseAmexSpecificFormat(rawData);
    }
    
    return processedData;
  }
  
  // Step 4: Process rows after the header row
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    
    // Skip empty rows
    if (!row[mapping.date] && !row[mapping.description]) {
      continue;
    }
    
    try {
      const transaction: AmexTransaction = {
        date: formatDate(row[mapping.date]),
        description: String(row[mapping.description] || ""),
        amount: parseAmount(row[mapping.amount]),
        reference: mapping.reference ? String(row[mapping.reference] || "") : "",
        category: mapping.category ? String(row[mapping.category] || "") : "",
        cardNumber: extractCardNumber(row, mapping.cardMember),
        cityState: extractCityState(row, mapping),
        zipCode: mapping.zip ? String(row[mapping.zip] || "") : "",
        country: mapping.country ? String(row[mapping.country] || "") : ""
      };
      
      // Only add valid transactions
      if (transaction.date && transaction.description && !isNaN(transaction.amount)) {
        processedData.push(transaction);
      } else {
        console.log('Debug: Skipping invalid transaction:', 
          'date:', transaction.date, 
          'description:', transaction.description, 
          'amount:', transaction.amount);
      }
    } catch (error) {
      console.error('Error processing row:', error, row);
    }
  }
  
  console.log(`Debug: Processed ${processedData.length} transactions out of ${rawData.length - headerRowIndex - 1} data rows`);
  return processedData;
}

// Special handler for AMEX-specific Excel format with Transaction Details column
function parseAmexSpecificFormat(rawData: RawAmexRow[]): AmexTransaction[] {
  console.log('Debug: Using AMEX-specific parser');
  const transactions: AmexTransaction[] = [];
  
  // Find the row with "Date" label to mark start of transactions
  let startRowIndex = -1;
  let dateColumn = '';
  let descColumn = '';
  let amountColumn = '';
  
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const keys = Object.keys(row);
    
    // Look for key matches in any column
    for (const key of keys) {
      const value = String(row[key] || "").toLowerCase();
      if (value === "date") {
        startRowIndex = i;
        dateColumn = key;
        
        // Try to find description and amount columns in the same row
        for (const otherKey of keys) {
          const otherValue = String(row[otherKey] || "").toLowerCase();
          if (otherValue.includes("description") || otherValue === "description") {
            descColumn = otherKey;
          } else if (otherValue.includes("amount") || otherValue === "amount") {
            amountColumn = otherKey;
          }
        }
        
        console.log('Debug: Found header row at index', i, 'with columns:', {
          dateColumn, descColumn, amountColumn
        });
        break;
      }
    }
    
    if (startRowIndex !== -1) break;
  }
  
  // If we found header row, parse transactions
  if (startRowIndex !== -1) {
    for (let i = startRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row[dateColumn]) continue; // Skip rows without date
      
      try {
        // Get date from column or try to extract date pattern from any column
        let dateValue = row[dateColumn];
        if (!dateValue) {
          // Look for date pattern in any column
          for (const key of Object.keys(row)) {
            const value = String(row[key] || "");
            if (value.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
              dateValue = value;
              break;
            }
          }
        }
        
        // Skip if we still don't have a date
        if (!dateValue) continue;
        
        // For amount, try to find a numeric value
        let amount = 0;
        if (amountColumn && row[amountColumn]) {
          amount = parseAmount(row[amountColumn]);
        } else {
          // Try to find amount in any column
          for (const key of Object.keys(row)) {
            const value = row[key];
            if (typeof value === 'number' || (typeof value === 'string' && value.match(/[-$,\d.]+/))) {
              const parsedAmount = parseAmount(value);
              if (!isNaN(parsedAmount) && parsedAmount !== 0) {
                amount = parsedAmount;
                break;
              }
            }
          }
        }
        
        // Get description
        let description = descColumn ? String(row[descColumn] || "") : "";
        if (!description) {
          // If no description found, use any non-date, non-amount column
          for (const key of Object.keys(row)) {
            const value = String(row[key] || "");
            if (value && key !== dateColumn && key !== amountColumn && !value.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
              description = value;
              break;
            }
          }
        }
        
        const transaction: AmexTransaction = {
          date: formatDate(dateValue),
          description: description,
          amount: amount,
          reference: `amex-${i}` // Generate reference if none exists
        };
        
        if (transaction.date && transaction.description && !isNaN(transaction.amount)) {
          transactions.push(transaction);
        }
      } catch (error) {
        console.error('Error processing row in AMEX-specific format:', error);
      }
    }
  } else {
    // If we can't find the date header, try looking for rows with date patterns directly
    console.log('Debug: Falling back to date pattern search');
    
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      let dateValue: string | number | null | undefined = null;
      let description = "";
      let amount = 0;
      
      // Check all columns for a date pattern
      for (const key of Object.keys(row)) {
        const value = row[key];
        const valueStr = String(value || "");
        
        if (valueStr.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
          dateValue = valueStr;
        } else if (typeof value === 'number' || (valueStr.match(/[-$,\d.]+/) && parseAmount(valueStr) !== 0)) {
          amount = parseAmount(valueStr);
        } else if (valueStr && !valueStr.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
          // Use non-date, non-amount values as potential descriptions
          if (description.length < valueStr.length) {
            description = valueStr;
          }
        }
      }
      
      if (dateValue && description) {
        const transaction: AmexTransaction = {
          date: formatDate(dateValue),
          description: description,
          amount: amount,
          reference: `amex-${i}`
        };
        
        if (transaction.date && transaction.description && !isNaN(transaction.amount)) {
          transactions.push(transaction);
        }
      }
    }
  }
  
  console.log(`Debug: Processed ${transactions.length} transactions using AMEX-specific parsing`);
  return transactions;
}

// Helper function to extract city and state
function extractCityState(row: RawAmexRow, mapping: Record<string, string>): string {
  if (mapping.city && row[mapping.city]) {
    if (mapping.state && row[mapping.state]) {
      return `${row[mapping.city]}, ${row[mapping.state]}`;
    }
    return String(row[mapping.city] || "");
  }
  return "";
}

// Helper function to extract card number with updated signature
function extractCardNumber(row: RawAmexRow, cardMemberKey?: string): string | undefined {
  if (cardMemberKey && row[cardMemberKey]) {
    const cardMemberValue = String(row[cardMemberKey]);
    // Extract last 5 digits of card number if present
    const cardNumberMatch = cardMemberValue.match(/\d{5}$/);
    if (cardNumberMatch) {
      return cardNumberMatch[0];
    }
    // Check if it contains "VRIJMOET" as in the original code
    if (cardMemberValue.includes("VRIJMOET")) {
      return "01001";
    }
  }
  
  // Fallback to checking any column for card number
  for (const key in row) {
    const value = String(row[key] || "");
    
    // Look for XXXX-XXXXX-00000 pattern
    if (value.match(/X+[-\s]?X+[-\s]?\d{5}/)) {
      const cardNumberMatch = value.match(/\d{5}$/);
      if (cardNumberMatch) {
        return cardNumberMatch[0];
      }
    }
    
    // Check if it contains "VRIJMOET" as in the original code
    if (value.includes("VRIJMOET")) {
      return "01001";
    }
  }
  
  return undefined;
}

// Helper function to format date from MM/DD/YYYY to YYYY-MM-DD
function formatDate(dateStr: string | number | null | undefined): string {
  if (!dateStr) return "";
  
  const dateString = String(dateStr);
  
  // Check if the date is already in a proper format
  if (dateString.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const [month, day, year] = dateString.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return dateString;
}

// Helper function to parse amount values
function parseAmount(amount: string | number | null | undefined): number {
  if (typeof amount === 'number') {
    return amount;
  }
  
  if (typeof amount === 'string') {
    // Remove any currency symbols or commas
    const cleanedAmount = amount.replace(/[$,]/g, '');
    return parseFloat(cleanedAmount) || 0;
  }
  
  return 0;
} 