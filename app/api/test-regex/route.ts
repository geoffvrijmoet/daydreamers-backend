import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import mongoose from 'mongoose';
import { Db, ObjectId } from 'mongodb';

export async function GET() {
  try {
    await connectToDatabase();
    
    // Get Viva Raw emails directly from MongoDB
    const vivaRawId = '678d6fc95f1c4351ab1f022f'; // ID from logs
    
    const vivaEmails = await (mongoose.connection.db as Db)
      .collection('invoiceemails')
      .find({ 
        supplierId: new ObjectId(vivaRawId)
      })
      .sort({ date: -1 })
      .limit(2)
      .toArray();
    
    if (vivaEmails.length === 0) {
      return NextResponse.json({ error: 'No Viva Raw emails found' }, { status: 404 });
    }
    
    // Test various patterns
    const testResults = vivaEmails.map(email => {
      // Get a snippet of the email body around "Total:"
      const totalIndex = email.body.indexOf('Total:');
      const context = totalIndex >= 0 
        ? email.body.substring(
            Math.max(0, totalIndex - 100), 
            Math.min(email.body.length, totalIndex + 100)
          )
        : 'Total not found';
      
      // Test with different pattern variants
      const patterns = [
        { 
          name: 'Database pattern with escaping', 
          pattern: 'Total: \\\\$(\\\\d+\\\\.\\\\d+)',
          flags: 'm'
        },
        { 
          name: 'Corrected pattern (single backslash)', 
          pattern: 'Total: \\$(\\d+\\.\\d+)',
          flags: 'm'
        },
        { 
          name: 'Flexible pattern', 
          pattern: 'Total:\\s*\\$(\\d+(?:\\.\\d+)?)',
          flags: 'm'
        },
        { 
          name: 'Simple pattern', 
          pattern: 'Total: \\$(\\d+\\.\\d+)',
          flags: ''
        },
        { 
          name: 'Raw string pattern', 
          pattern: 'Total: $209.20',
          flags: ''
        }
      ];
      
      // Test each pattern
      const patternResults = patterns.map(patternInfo => {
        try {
          console.log(`Testing pattern: ${patternInfo.pattern}`);
          const regex = new RegExp(patternInfo.pattern, patternInfo.flags);
          const match = email.body.match(regex);
          
          return {
            patternName: patternInfo.name,
            pattern: patternInfo.pattern,
            flags: patternInfo.flags,
            matched: !!match,
            match: match ? match[0] : null,
            value: match && match[1] ? match[1] : null
          };
        } catch (error) {
          return {
            patternName: patternInfo.name,
            pattern: patternInfo.pattern,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });
      
      return {
        emailId: email.emailId,
        subject: email.subject,
        context,
        patternResults
      };
    });
    
    return NextResponse.json({
      success: true,
      emailCount: vivaEmails.length,
      testResults
    });
    
  } catch (error) {
    console.error('Error testing regex:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Test failed' },
      { status: 500 }
    );
  }
} 