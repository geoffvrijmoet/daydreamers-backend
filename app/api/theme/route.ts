import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = await getDb()
    const theme = await db.collection('settings').findOne({ type: 'theme' })
    return NextResponse.json(theme?.colors || null)
  } catch (error) {
    console.error('Error fetching theme:', error)
    return NextResponse.json(
      { error: 'Failed to fetch theme' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const colors = await request.json()
    const db = await getDb()
    
    await db.collection('settings').updateOne(
      { type: 'theme' },
      { 
        $set: { 
          type: 'theme',
          colors,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    )

    return NextResponse.json({ success: true, colors })
  } catch (error) {
    console.error('Error saving theme:', error)
    return NextResponse.json(
      { error: 'Failed to save theme' },
      { status: 500 }
    )
  }
} 