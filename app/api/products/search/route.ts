import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { SmartMappingService } from '@/lib/services/smart-mapping-service'
import { ObjectId } from 'mongodb'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const term = url.searchParams.get('term')
    
    if (!term) {
      return NextResponse.json({ error: 'Search term is required' }, { status: 400 })
    }
    
    const db = await getDb()
    const products = db.collection('products')
    
    // First, check for smart mapping suggestions
    const suggestions = await SmartMappingService.suggestProductsForName(term)
    
    // Convert string IDs to ObjectIds
    const suggestedProductIds = suggestions
      .filter(s => s.confidence >= 60)
      .map(s => {
        try {
          return new ObjectId(s.productId)
        } catch {
          return null
        }
      })
      .filter((id): id is ObjectId => id !== null)
    
    // Build search query
    const searchQuery = {
      $or: [
        // Include products from smart mapping suggestions
        ...(suggestedProductIds.length > 0 ? [{ _id: { $in: suggestedProductIds } }] : []),
        // Include products matching the search term
        { name: { $regex: term, $options: 'i' } },
        { sku: { $regex: term, $options: 'i' } }
      ]
    }
    
    // Get matching products
    const matchingProducts = await products
      .find(searchQuery)
      .limit(20)
      .toArray()
    
    // Sort products: smart mapping suggestions first, then by name
    const sortedProducts = matchingProducts.sort((a, b) => {
      const aIndex = suggestedProductIds.findIndex(id => id.equals(a._id))
      const bIndex = suggestedProductIds.findIndex(id => id.equals(b._id))
      
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1
      
      return a.name.localeCompare(b.name)
    })
    
    // Add confidence scores from smart mapping
    const productsWithScores = sortedProducts.map(product => {
      const suggestion = suggestions.find(s => {
        try {
          return new ObjectId(s.productId).equals(product._id)
        } catch {
          return false
        }
      })
      return {
        ...product,
        confidence: suggestion?.confidence || 0
      }
    })
    
    return NextResponse.json({
      success: true,
      products: productsWithScores
    })
  } catch (error) {
    console.error('Error searching products:', error)
    return NextResponse.json(
      { error: 'Failed to search products' },
      { status: 500 }
    )
  }
} 