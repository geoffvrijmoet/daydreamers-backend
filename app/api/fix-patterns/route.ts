import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import mongoose from 'mongoose';
import { Db, ObjectId } from 'mongodb';

export async function GET() {
  try {
    await connectToDatabase();
    
    // Update Viva Raw's email parsing patterns
    const vivaRawId = '678d6fc95f1c4351ab1f022f'; // ID from logs
    
    // Define correct patterns with proper escaping
    // These should have ONE backslash for each special character
    const correctPatterns = {
      total: {
        pattern: 'Total: \\$(\\d+\\.\\d+)',
        flags: 'm',
        groupIndex: 1,
        transform: 'parseFloat'
      },
      subtotal: {
        pattern: 'Subtotal: \\$(\\d+\\.\\d+)',
        flags: 'm',
        groupIndex: 1,
        transform: 'parseFloat'
      },
      shipping: {
        pattern: 'Shipping: \\$(\\d+\\.\\d+)',
        flags: 'm',
        groupIndex: 1,
        transform: 'parseFloat'
      },
      tax: {
        pattern: 'Taxes: \\$(\\d+\\.\\d+)',
        flags: 'm',
        groupIndex: 1,
        transform: 'parseFloat'
      }
    };
    
    // Get current supplier data
    const supplier = await (mongoose.connection.db as Db)
      .collection('suppliers')
      .findOne({ _id: new ObjectId(vivaRawId) });
      
    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }
    
    console.log('Current email parsing:', supplier.emailParsing);
    
    // Update the supplier
    const updateResult = await (mongoose.connection.db as Db)
      .collection('suppliers')
      .updateOne(
        { _id: new ObjectId(vivaRawId) },
        { $set: { emailParsing: correctPatterns } }
      );
    
    // Test if the update worked by getting a Viva Raw email and trying the pattern
    const vivaEmails = await (mongoose.connection.db as Db)
      .collection('invoiceemails')
      .find({ 
        supplierId: new ObjectId(vivaRawId)
      })
      .sort({ date: -1 })
      .limit(1)
      .toArray();
    
    let testResults = null;
    
    if (vivaEmails.length > 0) {
      const email = vivaEmails[0];
      const totalPattern = correctPatterns.total;
      
      // Use the pattern to match
      try {
        const regex = new RegExp(totalPattern.pattern, totalPattern.flags || '');
        const match = email.body.match(regex);
        
        if (match) {
          const totalValue = match[totalPattern.groupIndex];
          testResults = {
            matched: true,
            pattern: totalPattern.pattern,
            matchedText: match[0],
            extractedValue: totalValue,
            transformedValue: totalPattern.transform === 'parseFloat' 
              ? parseFloat(totalValue) 
              : totalValue
          };
        } else {
          testResults = {
            matched: false,
            pattern: totalPattern.pattern,
            emailSnippet: email.body.substring(0, 300)
          };
        }
      } catch (error) {
        testResults = {
          error: error instanceof Error ? error.message : 'Unknown error',
          pattern: totalPattern.pattern
        };
      }
    }
    
    return NextResponse.json({
      success: true,
      updateResult: {
        acknowledged: updateResult.acknowledged,
        modifiedCount: updateResult.modifiedCount
      },
      testResults
    });
    
  } catch (error) {
    console.error('Error fixing patterns:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fix patterns' },
      { status: 500 }
    );
  }
} 