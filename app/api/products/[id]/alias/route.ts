import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import ProductModel from '@/lib/models/Product'

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

    if (!supplierId || !nameInInvoice) {
      return NextResponse.json({ error: 'supplierId and nameInInvoice required' }, { status: 400 })
    }

    const product = await ProductModel.findById(id)
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const aliases = product.supplierAliases || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exists = aliases.find((a: any) => a.supplierId.toString() === supplierId && a.nameInInvoice === nameInInvoice)

    if (!exists) {
      aliases.push({ supplierId, nameInInvoice })
      product.supplierAliases = aliases
      await product.save()
    }

    return NextResponse.json({ success: true, aliasCount: product.supplierAliases?.length || 0 })
  } catch (err) {
    console.error('add-alias error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
} 