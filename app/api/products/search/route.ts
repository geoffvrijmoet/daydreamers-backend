import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'
import { SmartMappingService } from '@/lib/services/smart-mapping-service'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const term = url.searchParams.get('term')
    const supplier = url.searchParams.get('supplier')
    
    if (!term && !supplier) {
      return NextResponse.json({ error: 'Search term or supplier is required' }, { status: 400 })
    }
    
    await connectToDatabase()
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
    const products = db.collection('products')
    
    let suggestions: { productId: string; confidence: number }[] = []
    let suggestedProductIds: ObjectId[] = []
    
    // If searching by term, get smart mapping suggestions
    if (term) {
      suggestions = await SmartMappingService.suggestProductsForName(term)
      
      // Convert string IDs to ObjectIds
      suggestedProductIds = suggestions
        .filter(s => s.confidence >= 60)
        .map(s => {
          try {
            return new ObjectId(s.productId)
          } catch {
            return null
          }
        })
        .filter((id): id is ObjectId => id !== null)
    }
    
    // Build search query
    const searchCriteria: object[] = []
    
    // Add smart mapping suggestions if available
    if (suggestedProductIds.length > 0) {
      searchCriteria.push({ _id: { $in: suggestedProductIds } })
    }
    
    // Add term-based search if term provided
    if (term) {
      searchCriteria.push(
        { name: { $regex: term, $options: 'i' } },
        { sku: { $regex: term, $options: 'i' } }
      )
    }
    
    // Add supplier filter if provided
    if (supplier) {
      searchCriteria.push({ supplier: { $regex: supplier, $options: 'i' } })
    }
    
    const searchQuery = searchCriteria.length > 0 ? { $or: searchCriteria } : {}
    
    // Get matching products
    // When searching by supplier only, get all products; otherwise limit for performance
    const query = products.find(searchQuery)
    let matchingProducts
    if (!term && supplier) {
      // Supplier-only search: get all products
      matchingProducts = await query.toArray()
    } else {
      // Term-based search: limit for performance
      matchingProducts = await query.limit(20).toArray()
    }
    console.log(matchingProducts)
    
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