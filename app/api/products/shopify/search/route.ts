import { NextResponse } from 'next/server'
import { shopifyClient } from '@/lib/shopify'

interface ShopifyProductEdge {
  node: {
    id: string
    title: string
    variants: {
      edges: Array<{
        node: {
          id: string
          title: string
          sku: string
        }
      }>
    }
  }
}

interface ShopifySearchResponse {
  products: {
    edges: ShopifyProductEdge[]
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query')

    if (!query) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      )
    }

    // Search for products using GraphQL
    const searchQuery = `
      query searchProducts($query: String!) {
        products(first: 10, query: $query) {
          edges {
            node {
              id
              title
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `

    const response = await shopifyClient.graphql(searchQuery, { query }) as ShopifySearchResponse

    // Transform the response to a simpler format
    const products = response.products.edges.map((edge: ShopifyProductEdge) => ({
      id: edge.node.id,
      title: edge.node.title,
      variants: edge.node.variants.edges.map((variantEdge) => ({
        id: variantEdge.node.id,
        title: variantEdge.node.title,
        sku: variantEdge.node.sku
      }))
    }))

    return NextResponse.json({ products })
  } catch (error) {
    console.error('Error searching Shopify products:', error)
    return NextResponse.json(
      { error: 'Failed to search products' },
      { status: 500 }
    )
  }
} 