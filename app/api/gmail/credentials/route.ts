import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { GmailCredentials } from '@/types'

export async function GET() {
  try {
    await connectToDatabase()
    const credentials = await mongoose.model('Credential').findOne({ type: 'gmail' })
    return NextResponse.json({ 
      hasCredentials: !!credentials,
      credentials: credentials?.data || null
    })
  } catch (error) {
    console.error('Error fetching Gmail credentials:', error)
    return NextResponse.json(
      { error: 'Failed to fetch credentials' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const credentials: GmailCredentials = await request.json()
    await connectToDatabase()
    
    await mongoose.model('Credential').updateOne(
      { type: 'gmail' },
      { 
        $set: { 
          type: 'gmail',
          data: credentials,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving Gmail credentials:', error)
    return NextResponse.json(
      { error: 'Failed to save credentials' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    await connectToDatabase()
    await mongoose.model('Credential').deleteOne({ type: 'gmail' })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting Gmail credentials:', error)
    return NextResponse.json(
      { error: 'Failed to delete credentials' },
      { status: 500 }
    )
  }
} 