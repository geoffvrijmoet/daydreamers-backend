import { NextResponse } from 'next/server'
import SupplierModel from '@/lib/models/Supplier'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface TrainingBody {
  prompt: string // first few-KB of email body
  result: Record<string, unknown> // corrected JSON result
}

export async function POST (request: Request, { params }: { params: { id: string } }) {
  try {
    await connectToDatabase()

    const { id } = params
    const body = (await request.json()) as TrainingBody

    if (!body.prompt || !body.result) {
      return NextResponse.json({ error: 'prompt and result are required' }, { status: 400 })
    }

    const supplier = await SupplierModel.findById(id)
    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    const maxSamples = supplier.aiTraining?.maxSamples || 10
    const samples = supplier.aiTraining?.samples || []

    // Convert productId strings to ObjectIds (deep in result -> products.products)
    const normalizeResult = (raw: Record<string, unknown>) => {
      const cloned = JSON.parse(JSON.stringify(raw))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const prodSection = cloned?.products as Record<string, unknown> | undefined
      if (prodSection && Array.isArray((prodSection as { products?: unknown }).products)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prodSection.products = (prodSection as { products: unknown[] }).products.map((raw: unknown) => {
          const p = raw as Record<string, unknown>
          if (p && typeof p.productId === 'string' && mongoose.isValidObjectId(p.productId)) {
            p.productId = new mongoose.Types.ObjectId(p.productId)
          }
          return p
        })
      }
      return cloned
    }

    // push new sample to front
    samples.unshift({ prompt: body.prompt, result: normalizeResult(body.result) })
    // trim
    const trimmed = samples.slice(0, maxSamples)

    supplier.aiTraining = {
      samples: trimmed,
      maxSamples
    }

    await supplier.save()

    return NextResponse.json({ success: true, sampleCount: trimmed.length })
  } catch (err) {
    console.error('ai-training route error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
} 