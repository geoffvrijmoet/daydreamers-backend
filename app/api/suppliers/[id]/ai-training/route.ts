import { NextResponse } from 'next/server'
import SupplierModel from '@/lib/models/Supplier'
import { connectToDatabase } from '@/lib/mongoose'

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

    // push new sample to front
    samples.unshift({ prompt: body.prompt, result: body.result })
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