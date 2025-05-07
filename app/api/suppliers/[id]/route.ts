import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import { ObjectId } from 'mongodb'
import SupplierModel from '@/lib/models/Supplier'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    
    const id = params.id
    
    // Validate id format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid supplier ID format' },
        { status: 400 }
      )
    }
    
    // Get the supplier
    const supplier = await SupplierModel.findById(id).lean()
    
    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ supplier })
  } catch (error) {
    console.error('Error fetching supplier:', error)
    return NextResponse.json(
      { error: 'Failed to fetch supplier' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    
    const id = params.id
    
    // Validate id format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid supplier ID format' },
        { status: 400 }
      )
    }
    
    // Get request body
    const body = await request.json()
    
    // Update the supplier
    const updatedSupplier = await SupplierModel.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true, runValidators: true }
    ).lean()
    
    if (!updatedSupplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ 
      success: true,
      supplier: updatedSupplier 
    })
  } catch (error) {
    console.error('Error updating supplier:', error)
    return NextResponse.json(
      { error: 'Failed to update supplier' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await connectToDatabase()
    
    const id = params.id
    
    // Validate id format
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid supplier ID format' },
        { status: 400 }
      )
    }
    
    // Delete the supplier
    const deletedSupplier = await SupplierModel.findByIdAndDelete(id).lean()
    
    if (!deletedSupplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Supplier deleted successfully' 
    })
  } catch (error) {
    console.error('Error deleting supplier:', error)
    return NextResponse.json(
      { error: 'Failed to delete supplier' },
      { status: 500 }
    )
  }
} 