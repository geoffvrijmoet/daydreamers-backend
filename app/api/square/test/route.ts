import { NextResponse } from 'next/server'
import { validateSquareCredentials } from '@/lib/square'

export async function GET() {
  try {
    const isValid = await validateSquareCredentials()
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid Square credentials' },
        { status: 401 }
      )
    }
    return NextResponse.json({ status: 'Square credentials are valid' })
  } catch (error) {
    console.error('Square Test Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 