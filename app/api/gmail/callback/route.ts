import { NextResponse } from 'next/server'
import { gmailService } from '@/lib/gmail'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { auth } from '@clerk/nextjs/server'

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    
    if (!code) {
      return NextResponse.json(
        { error: 'No authorization code provided' },
        { status: 400 }
      )
    }

    // Exchange code for tokens
    const credentials = await gmailService.getTokens(code)

    // Store credentials in database
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

    // Redirect to success page
    return NextResponse.redirect(new URL('/settings/gmail?success=true', request.url))
  } catch (error) {
    console.error('Gmail callback error:', error)
    return NextResponse.redirect(new URL('/settings/gmail?error=true', request.url))
  }
} 