import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import ProductModel from '@/lib/models/Product'
import mongoose from 'mongoose'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Body {
  supplierId: string
  nameInInvoice: string
}

export async function POST (request: Request, { params }: { params: { id: string } }) {
  try {
    await connectToDatabase()
    const { id } = params
    const { supplierId, nameInInvoice } = await request.json() as Body

    console.log('[AliasRoute] Incoming alias request', { productId: id, supplierId, nameInInvoice })

    if (!supplierId || !nameInInvoice) {
      return NextResponse.json({ error: 'supplierId and nameInInvoice required' }, { status: 400 })
    }

    // Use atomic update to avoid validating entire document (which may fail).
    const objSupplierId = new mongoose.Types.ObjectId(supplierId)

    // Check & add only if not present
    const res = await ProductModel.updateOne(
      {
        _id: id,
        supplierAliases: { $not: { $elemMatch: { supplierId: objSupplierId, nameInInvoice } } }
      },
      {
        $addToSet: { supplierAliases: { supplierId: objSupplierId, nameInInvoice } }
      },
      { runValidators: false }
    )

    if (res.modifiedCount > 0) {
      console.log('[AliasRoute] Alias added via $addToSet', { productId: id })
    } else {
      console.log('[AliasRoute] Alias already existed or product missing')
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('add-alias error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
} 