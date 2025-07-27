import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import mongoose from 'mongoose';
import { Document, ObjectId, WithId } from 'mongodb';

interface EmailParsingField {
  pattern: string;
  flags?: string;
  groupIndex: number;
  transform?: string;
}

interface Supplier extends WithId<Document> {
  name: string;
  invoiceEmail: string;
  invoiceSubjectPattern: string;
  emailParsing?: {
    total?: EmailParsingField;
    orderNumber?: EmailParsingField;
    shipping?: EmailParsingField;
    subtotal?: EmailParsingField;
    tax?: EmailParsingField;
    discount?: EmailParsingField;
    products?: {
      items: {
        name: EmailParsingField;
        quantity: EmailParsingField;
        total: EmailParsingField;
      };
      wholesaleDiscount?: number;
    };
    [key: string]: EmailParsingField | { items: { name: EmailParsingField; quantity: EmailParsingField; total: EmailParsingField; }; wholesaleDiscount?: number } | undefined;
  };
}

// Define a more specific type for emails in testVivaRawPatterns
interface TestEmail extends WithId<Document> {
  supplierId?: ObjectId;
  subject: string;
  body: string;
}

// Test if Viva Raw's parsing patterns work on their emails
const testVivaRawPatterns = (emails: TestEmail[], suppliers: Supplier[]) => {
  // Find Viva Raw supplier
  const vivaRaw = suppliers.find(s => s.name === 'Viva Raw');
  if (!vivaRaw) {
    console.log('Viva Raw supplier not found');
    return;
  }
  
  if (!vivaRaw.emailParsing) {
    console.log('Viva Raw has no emailParsing config');
    return;
  }
  
  console.log('=== Testing Viva Raw Patterns ===');
  console.log('Pattern configs:', JSON.stringify(vivaRaw.emailParsing, null, 2));
  
  // Find Viva Raw emails
  const vivaEmails = emails.filter(e => 
    e.supplierId && e.supplierId.toString() === vivaRaw._id.toString()
  );
  
  console.log(`Found ${vivaEmails.length} Viva Raw emails`);
  
  // Ensure vivaRaw.emailParsing exists before proceeding
  if (!vivaRaw.emailParsing) {
    console.log('Viva Raw emailParsing config is missing after initial check, skipping tests for it.');
    return;
  }
  const vivaParsingConfig = vivaRaw.emailParsing; // Now non-null

  vivaEmails.forEach(email => {
    console.log(`Testing email: ${email.subject}`);
    
    // Try to match total pattern
    if (vivaParsingConfig.total) {
      const { pattern, flags, groupIndex } = vivaParsingConfig.total;
      try {
        const regex = new RegExp(pattern, flags || '');
        const match = email.body.match(regex);
        
        console.log(`Total pattern: ${pattern}`);
        console.log(`Match result: ${match ? 'Found match' : 'No match'}`);
        
        if (match) {
          console.log(`Matched text: ${match[0]}`);
          console.log(`Extracted value: ${match[groupIndex]}`);
          
          // Show surrounding context
          const bodyLines = email.body.split('\n');
          const lineWithMatch = bodyLines.findIndex(line => line.includes(match[0]));
          
          if (lineWithMatch >= 0) {
            console.log('Context:');
            const startLine = Math.max(0, lineWithMatch - 2);
            const endLine = Math.min(bodyLines.length - 1, lineWithMatch + 2);
            
            for (let i = startLine; i <= endLine; i++) {
              console.log(`${i === lineWithMatch ? '>>>' : '   '} ${bodyLines[i]}`);
            }
          }
        } else {
          // If no match, let's see if we can find the text "Total:"
          const totalIndex = email.body.indexOf('Total:');
          if (totalIndex >= 0) {
            const context = email.body.substring(
              Math.max(0, totalIndex - 50), 
              Math.min(email.body.length, totalIndex + 50)
            );
            console.log('Found "Total:" but pattern didn\'t match. Context:');
            console.log(context);
          } else {
            console.log('Could not find "Total:" in the email body');
          }
        }
      } catch (e) {
        console.error('Error testing pattern:', e);
      }
    }
  });
  
  console.log('=== End Testing ===');
};

export async function GET() {
  try {
    await connectToDatabase();
    
    // Get invoice emails directly from MongoDB to preserve all fields
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
    const rawEmails = await db
      .collection('invoiceemails')
      .find({})
      .sort({ date: -1 })
      .limit(100)
      .toArray();
    
    console.log('Raw invoice emails:', rawEmails.map(email => ({
      id: email._id.toString(),
      emailId: email.emailId,
      supplierId: email.supplierId?.toString(),
      subject: email.subject
    })));
    
    // Get unique supplier IDs
    const supplierIds = [...new Set(
      rawEmails
        .map(email => email.supplierId)
        .filter(id => id)
        .map(id => id.toString())
    )];
    
    console.log('Unique supplier IDs:', supplierIds);
    
    if (supplierIds.length === 0) {
      console.log('No supplier IDs found in invoice emails');
      return NextResponse.json({
        success: true,
        invoiceEmails: rawEmails
      });
    }
    
    // Convert string IDs to ObjectId instances
    const supplierObjectIds = supplierIds.map(id => {
      try {
        return new ObjectId(id);
      } catch {
        console.error('Invalid ObjectId:', id);
        return null;
      }
    }).filter((id): id is ObjectId => id !== null);
    
    // Query suppliers
    const suppliers = await db
      .collection('suppliers')
      .find<Supplier>({ 
        _id: { $in: supplierObjectIds }
      })
      .toArray();
    
    console.log('Found suppliers:', suppliers.map(s => ({
      id: s._id.toString(),
      name: s.name
    })));
    
    // Test Viva Raw patterns
    testVivaRawPatterns(rawEmails as TestEmail[], suppliers);
    
    // Create supplier lookup map
    const supplierMap = suppliers.reduce((map, supplier) => {
      map[supplier._id.toString()] = supplier;
      return map;
    }, {} as Record<string, Supplier>);
    
    // Transform emails to include supplier info
    const transformedEmails = rawEmails.map(email => {
      const supplierId = email.supplierId?.toString();
      const supplier = supplierId ? supplierMap[supplierId] : null;
      
      // Debug the supplier data being passed
      if (supplier) {
        console.log(`Supplier for email ${email._id}:`, {
          id: supplier._id.toString(),
          name: supplier.name,
          hasEmailParsing: !!supplier.emailParsing
        });
        
        if (supplier.emailParsing) {
          console.log('Email parsing config fields:', Object.keys(supplier.emailParsing));
        }
      }
      
      return {
        ...email,
        supplier: supplier ? {
          id: supplier._id.toString(),
          name: supplier.name,
          invoiceEmail: supplier.invoiceEmail,
          invoiceSubjectPattern: supplier.invoiceSubjectPattern,
          emailParsing: supplier.emailParsing
        } : null
      };
    });
    
    return NextResponse.json({
      success: true,
      invoiceEmails: transformedEmails
    });
    
  } catch (error) {
    console.error('Error fetching invoice emails:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch invoice emails' },
      { status: 500 }
    );
  }
} 