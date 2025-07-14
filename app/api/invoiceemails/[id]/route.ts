import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import InvoiceEmailModel from '@/lib/models/InvoiceEmail';
import mongoose from 'mongoose';

// PATCH endpoint to update an invoice email
export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    await connectToDatabase();
    
    const { id } = context.params;
    const body = await request.json();
    
    // Validate the invoice email ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid invoice email ID' },
        { status: 400 }
      );
    }
    
    // Update the invoice email
    const updatedEmail = await InvoiceEmailModel.findByIdAndUpdate(
      id,
      {
        ...body,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!updatedEmail) {
      return NextResponse.json(
        { error: 'Invoice email not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      invoiceEmail: updatedEmail
    });
    
  } catch (error) {
    console.error('Error updating invoice email:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update invoice email' },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch a specific invoice email
export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    await connectToDatabase();
    
    const { id } = context.params;
    
    // Validate the invoice email ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid invoice email ID' },
        { status: 400 }
      );
    }
    
    const email = await InvoiceEmailModel.findById(id);
    
    if (!email) {
      return NextResponse.json(
        { error: 'Invoice email not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      invoiceEmail: email
    });
    
  } catch (error) {
    console.error('Error fetching invoice email:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch invoice email' },
      { status: 500 }
    );
  }
} 