import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Static OpenAI client (re-used across invocations)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function createGeminiClient (version: 'v1' | 'v1beta' | 'v1alpha') {
  const key = process.env.GEMINI_API_KEY || ''
  // The SDK constructor's signature variants aren't reflected in current @types; cast to any to pass httpOptions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (GoogleGenerativeAI as any)(key, { httpOptions: { apiVersion: version } }) as GoogleGenerativeAI
}

export interface AIProduct {
  name: string
  quantity: number
  lineTotal: string
}

export interface AIParseResult {
  orderNumber: string | null
  subtotal: string | null
  shipping: string | null
  tax: string | null
  discount: string | null
  orderTotal: string | null
  products: AIProduct[]
}

const JSON_SCHEMA = `{
  "orderNumber": null,
  "subtotal": null,
  "shipping": null,
  "tax": null,
  "discount": null,
  "orderTotal": null,
  "products": [
    { "name": "string", "quantity": 0, "lineTotal": "string" }
  ]
}`

const SYSTEM_PROMPT = `You are an API that extracts structured purchase data from invoice email bodies. Respond ONLY with JSON (no markdown, no additional keys) matching this schema:\n${JSON_SCHEMA}`

export async function parseInvoiceEmail (body: string, examples: { prompt: string; result: any }[] = []): Promise<AIParseResult> { // eslint-disable-line @typescript-eslint/no-explicit-any
  // Build chat messages in true few-shot format:  (user email ➜ assistant JSON)
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT }
  ]

  if (examples?.length) {
    examples.slice(0, 10).forEach(ex => {
      messages.push({ role: 'user', content: ex.prompt })
      messages.push({ role: 'assistant', content: JSON.stringify(ex.result) })
    })
  }

  // Actual request
  messages.push({ role: 'user', content: body })

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 512, // keep budget unchanged
      response_format: { type: 'json_object' },
      messages
    })

    const content = completion.choices?.[0]?.message?.content?.trim() || '{}'
    return JSON.parse(content) as AIParseResult
  } catch (err) {
    // If quota-related error, fallback to Gemini
    if (isQuotaError(err)) {
      console.warn('OpenAI quota error – falling back to Gemini')
      return parseWithGemini(body, examples)
    }

    console.error('OpenAI parse error (non-quota):', err)
    throw err
  }
}

async function parseWithGemini (body: string, examples: { prompt: string; result: any }[]): Promise<AIParseResult> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const apiVersions: ('v1' | 'v1beta' | 'v1alpha')[] = ['v1', 'v1beta', 'v1alpha']
  const candidateModels = ['gemini-2.0-flash']

  let lastErr: unknown = null

  for (const apiVersion of apiVersions) {
    const genAI = createGeminiClient(apiVersion)

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName })

        // Build few-shot prompt (simple concatenation)
        let prompt = `${SYSTEM_PROMPT}\n\n`

        examples.slice(0, 10).forEach(ex => {
          prompt += `Email:\n${ex.prompt}\nJSON:\n${JSON.stringify(ex.result)}\n\n`
        })

        prompt += `Email:\n${body}\nJSON:`

        const result = await model.generateContent(prompt)
        let text = result.response.text().trim()

        // Strip Markdown fences if present
        if (text.startsWith('```')) {
          text = text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/```$/m, '').trim()
        }

        try {
          return JSON.parse(text) as AIParseResult
        } catch (parseErr) {
          console.error('Gemini returned non-JSON text:', text)
          throw parseErr
        }
      } catch (err) {
        lastErr = err
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
        // If model absent or version unsupported, try next combination
        if (msg.includes('not found') || msg.includes('unsupported')) {
          continue
        }
        // Otherwise propagate
        throw err
      }
    }
  }

  // If we reach here, all attempts failed
  console.error('Gemini fallback failed:', lastErr)
  throw lastErr || new Error('Gemini fallback failed')
}

function isQuotaError (err: unknown) {
  // OpenAI SDK exposes APIError with status & code
  // Avoid importing types; do duck-typing instead
  const anyErr = err as Record<string, unknown> | undefined

  if (anyErr?.status === 429 || anyErr?.code === 'rate_limit_exceeded') {
    return true
  }

  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return msg.includes('insufficient_quota') ||
         msg.includes('insufficient credits') ||
         msg.includes('you exceeded your current quota') ||
         msg.includes('rate limit')
} 