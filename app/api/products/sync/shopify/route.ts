import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { ObjectId } from 'mongodb'

type ProductMatch = {
  shopifyId: string
  shopifyVariantId: string
  mongoId: string
}

export async function POST(request: Request) {
  try {
    const db = await getDb()
    console.log('Starting Shopify product sync...')

    // Get matches from request and transform to array format
    const { matches } = await request.json() as { matches: Record<string, string> }
    
    // Transform matches object to array of ProductMatch objects
    const matchesArray: ProductMatch[] = Object.entries(matches).map(([shopifyId, mongoId]) => ({
      shopifyId,
      shopifyVariantId: shopifyId, // In this case they're the same
      mongoId
    }))
    
    // Process each match
    const updates = await Promise.all(matchesArray.map(async (match) => {
      try {
        // Update MongoDB product with Shopify IDs
        const result = await db.collection('products').updateOne(
          { _id: new ObjectId(match.mongoId) },
          { 
            $set: { 
              shopifyId: match.shopifyId,
              shopifyVariantId: match.shopifyVariantId,
              updatedAt: new Date().toISOString()
            }
          }
        )

        if (result.modifiedCount === 0) {
          throw new Error(`Failed to update product ${match.mongoId}`)
        }

        return { 
          action: 'matched',
          mongoId: match.mongoId,
          shopifyId: match.shopifyId
        }
      } catch (err) {
        console.error(`Error processing match for product ${match.mongoId}:`, err)
        return {
          action: 'error',
          mongoId: match.mongoId,
          shopifyId: match.shopifyId,
          error: err instanceof Error ? err.message : 'Unknown error'
        }
      }
    }))

    const successful = updates.filter(u => u.action === 'matched').length
    const failed = updates.filter(u => u.action === 'error').length

    return NextResponse.json({
      message: `Sync complete. Matched: ${successful}, Failed: ${failed} products`,
      details: updates
    })

  } catch (error) {
    console.error('Error syncing Shopify products:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync products' },
      { status: 500 }
    )
  }
} 