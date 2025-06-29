import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import ProductModel from '@/lib/models/Product'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET (request: Request) {
  try {
    const url = new URL(request.url)
    const supplierId = url.searchParams.get('supplierId')
    const name = url.searchParams.get('name')
    if (!supplierId || !name) {
      return NextResponse.json({ error: 'supplierId and name are required' }, { status: 400 })
    }

    console.log('[FindByAlias] lookup', { supplierId, name })

    await connectToDatabase()
    const objSupplierId = new mongoose.Types.ObjectId(supplierId)

    const product = await ProductModel.findOne({
      supplierAliases: {
        $elemMatch: {
          supplierId: objSupplierId,
          nameInInvoice: { $regex: `^${name}$`, $options: 'i' }
        }
      }
    }).select({ name: 1 }).lean()

    if (product) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = product
      console.log('[FindByAlias] match', { productId: p._id?.toString?.(), name: p.name })
    } else {
      console.log('[FindByAlias] no match')
    }

    return NextResponse.json({ success: true, product })
  } catch (err) {
    console.error('find-by-alias error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
} 