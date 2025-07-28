import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import mongoose from 'mongoose';

interface TestResult {
  subject: string;
  matches: Record<string, unknown>;
  totalContext?: string;
  emailSnippet: string;
}

export async function GET() {
  try {
    await connectToDatabase();
    
    // Find the Viva Raw supplier
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
    const vivaRaw = await db.collection('suppliers')
      .findOne({ name: 'Viva Raw' });
    
    if (!vivaRaw) {
      return NextResponse.json({ error: 'Viva Raw supplier not found' }, { status: 404 });
    }
    
    console.log('Found Viva Raw supplier:', vivaRaw._id.toString());
    
    // Get a sample email to test patterns on
    const vivaEmails = await db.collection('invoiceemails')
      .find({ 
        supplierId: vivaRaw._id 
      })
      .limit(1)
      .toArray();
    
    if (vivaEmails.length === 0) {
      return NextResponse.json({ error: 'No Viva Raw emails found' }, { status: 404 });
    }
    
    // Extract text samples from the email to design patterns
    const emailBody = vivaEmails[0].body;
    
    // Find the positions of important data
    const total = emailBody.match(/Total:\s*\$(\d+\.\d+)/);
    const subtotal = emailBody.match(/Subtotal:\s*\$(\d+\.\d+)/);
    const shipping = emailBody.match(/Shipping:\s*\$(\d+\.\d+)/);
    const taxes = emailBody.match(/Taxes:\s*\$(\d+\.\d+)/);
    const discount = emailBody.match(/Discount:\s*\$-(\d+\.\d+)/);
    const orderNumber = emailBody.match(/ORDER NUMBER:\s*#(\d+)/i);
    
    console.log('Pattern matches found:');
    console.log('Total:', total ? total[0] : 'Not found');
    console.log('Subtotal:', subtotal ? subtotal[0] : 'Not found');
    console.log('Shipping:', shipping ? shipping[0] : 'Not found');
    console.log('Taxes:', taxes ? taxes[0] : 'Not found');
    console.log('Discount:', discount ? discount[0] : 'Not found');
    console.log('Order Number:', orderNumber ? orderNumber[0] : 'Not found');
    
    // Update with correct email parsing patterns
    const updateResult = await db.collection('suppliers')
      .updateOne(
        { _id: vivaRaw._id },
        { 
          $set: { 
            emailParsing: {
              total: {
                pattern: 'Total:\\s*\\$([\\d\\.]+)',
                flags: 'm',
                groupIndex: 1,
                transform: 'parseFloat'
              },
              subtotal: {
                pattern: 'Subtotal:\\s*\\$([\\d\\.]+)',
                flags: 'm',
                groupIndex: 1,
                transform: 'parseFloat'
              },
              shipping: {
                pattern: 'Shipping:\\s*\\$([\\d\\.]+)',
                flags: 'm',
                groupIndex: 1,
                transform: 'parseFloat'
              },
              tax: {
                pattern: 'Taxes:\\s*\\$([\\d\\.]+)',
                flags: 'm',
                groupIndex: 1,
                transform: 'parseFloat'
              },
              discount: {
                pattern: 'Discount:\\s*\\$-([\\d\\.]+)',
                flags: 'm',
                groupIndex: 1,
                transform: 'parseFloat'
              },
              orderNumber: {
                pattern: 'ORDER NUMBER:\\s*#([\\d]+)',
                flags: 'im', // case insensitive
                groupIndex: 1,
                transform: 'parseInt'
              }
            }
          }
        }
      );
    
    console.log('Update result:', updateResult);
    
    // Now test if the patterns work on an email
    const testResults = vivaEmails.map(email => {
      const results: TestResult = {
        subject: email.subject,
        matches: {},
        emailSnippet: email.body.substring(0, 300) + '...'
      };
      
      // Test each pattern
      ['total', 'subtotal', 'shipping', 'tax', 'discount', 'orderNumber'].forEach(field => {
        try {
          let pattern = '';
          let flags = '';
          
          switch (field) {
            case 'total':
              pattern = 'Total:\\s*\\$([\\d\\.]+)';
              flags = 'm';
              break;
            case 'subtotal':
              pattern = 'Subtotal:\\s*\\$([\\d\\.]+)';
              flags = 'm';
              break;
            case 'shipping':
              pattern = 'Shipping:\\s*\\$([\\d\\.]+)';
              flags = 'm';
              break;
            case 'tax':
              pattern = 'Taxes:\\s*\\$([\\d\\.]+)';
              flags = 'm';
              break;
            case 'discount':
              pattern = 'Discount:\\s*\\$-([\\d\\.]+)';
              flags = 'm';
              break;
            case 'orderNumber':
              pattern = 'ORDER NUMBER:\\s*#([\\d]+)';
              flags = 'im';
              break;
          }
          
          const regex = new RegExp(pattern, flags);
          const match = email.body.match(regex);
          
          results.matches[field] = match ? {
            fullMatch: match[0],
            value: match[1]
          } : 'No match';
          
          // If no match, show context
          if (!match && field === 'total') {
            const totalIndex = email.body.indexOf('Total:');
            if (totalIndex >= 0) {
              const context = email.body.substring(
                Math.max(0, totalIndex - 50), 
                Math.min(email.body.length, totalIndex + 50)
              );
              results.totalContext = context;
            }
          }
        } catch {
          results.matches[field] = { error: 'Error matching pattern' };
        }
      });
      
      return results;
    });
    
    return NextResponse.json({
      success: true,
      message: 'Viva Raw email parsing configuration updated',
      updateResult,
      testResults
    });
    
  } catch (error) {
    console.error('Error updating email parsing config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update config' },
      { status: 500 }
    );
  }
} 