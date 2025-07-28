import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

export async function GET() {
  try {
    await connectToDatabase()
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
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
    await connectToDatabase()
    
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
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