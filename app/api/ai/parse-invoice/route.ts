import { NextResponse } from 'next/server'
import { parseInvoiceEmail } from '@/lib/services/ai-email-parser'
import SupplierModel from '@/lib/models/Supplier'
import { connectToDatabase } from '@/lib/mongoose'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function stripHtmlHead (html: string) {
  const lower = html.toLowerCase()
  const headClose = lower.indexOf('</head>')
  if (headClose !== -1) {
    return html.slice(headClose + 7) // 7 = length of '</head>'
  }
  return html
}

function applyContentBounds (body: string, bounds?: { startPattern?: { pattern: string; flags?: string }; endPattern?: { pattern: string; flags?: string } }) {
  if (!bounds) return body

  let startIdx = 0
  let endIdx = body.length

  if (bounds.startPattern?.pattern) {
    const regex = new RegExp(bounds.startPattern.pattern, bounds.startPattern.flags || 'i')
    const m = body.match(regex)
    if (m && m.index !== undefined) {
      startIdx = m.index
    }
  }

  if (bounds.endPattern?.pattern) {
    const regex = new RegExp(bounds.endPattern.pattern, bounds.endPattern.flags || 'i')
    const m = body.match(regex)
    if (m && m.index !== undefined) {
      endIdx = m.index + m[0].length
    }
  }

  return body.slice(startIdx, endIdx)
}

export async function POST(request: Request) {
  try {
    const { emailBody, supplierId } = await request.json()

    if (!emailBody || typeof emailBody !== 'string') {
      return NextResponse.json({ error: 'emailBody is required' }, { status: 400 })
    }

    let examples: { prompt: string; result: Record<string, unknown> }[] = []
    let processedBody = stripHtmlHead(emailBody)

    if (supplierId) {
      await connectToDatabase()
      const supplier = await SupplierModel.findById(supplierId).lean() as any // eslint-disable-line @typescript-eslint/no-explicit-any
      if (supplier?.aiTraining?.samples?.length) {
        examples = supplier.aiTraining.samples as { prompt: string; result: Record<string, unknown> }[]
      }

      // Apply content bounds if configured
      processedBody = applyContentBounds(processedBody, supplier?.emailParsing?.contentBounds)
    }

    const data = await parseInvoiceEmail(processedBody, examples)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('AI parse error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse with AI' },
      { status: 500 }
    )
  }
} 