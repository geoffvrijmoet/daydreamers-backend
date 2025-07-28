import { NextResponse } from 'next/server'
import { shopifyClient } from '@/lib/shopify'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'

type ShopifyProduct = {
  id: string
  title: string
  description?: string
  sku?: string
  price: number
  variantId: string
}

type ShopifyGraphQLProduct = {
  id: string
  title: string
  description: string
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT'
  variants: {
    edges: Array<{
      node: {
        id: string
        title: string
        sku: string | null
        price: string
        inventoryQuantity: number
      }
    }>
  }
}

type ShopifyGraphQLResponse = {
  products: {
    edges: Array<{
      node: ShopifyGraphQLProduct
    }>
    pageInfo: {
      hasNextPage: boolean
      endCursor: string
    }
  }
}

export async function GET() {
  try {
    await connectToDatabase()
    console.log('Fetching Shopify products for preview...')

    // Get ALL active products from MongoDB, including those already matched
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
    const existingProducts = await db.collection('products')
      .find({ 
        active: { $ne: false }
      })
      .project({ 
        _id: 1,
        name: 1,
        sku: 1,
        description: 1,
        price: 1,
        shopifyId: 1,  // Include existing Shopify ID
        shopifyVariantId: 1  // Include existing variant ID
      })
      .toArray()
    
    const unmatched = existingProducts.filter(p => !p.shopifyId)
    const matched = existingProducts.filter(p => p.shopifyId)
    console.log(`Found ${unmatched.length} unmatched and ${matched.length} matched products in MongoDB`)

    // Create a map of Shopify IDs to MongoDB products for quick lookup
    const shopifyToMongoMap = new Map(
      matched.map(p => [p.shopifyId, p])
    )

    // Get all products from Shopify using GraphQL
    const query = `{
      products(first: 250, query: "status:active") {
        edges {
          node {
            id
            title
            description: bodyHtml
            status
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  inventoryQuantity
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`

    console.log('Fetching products with GraphQL...')
    const graphqlResponse = await shopifyClient.graphql(query) as ShopifyGraphQLResponse
    console.log('GraphQL response received')

    // Transform the GraphQL response
    const allProducts = graphqlResponse.products.edges
      .map(edge => edge.node)
      .filter(product => product.status === 'ACTIVE')
    console.log(`Fetched ${allProducts.length} active products`)
    
    // Transform Shopify products into a simpler format
    const shopifyProducts: ShopifyProduct[] = allProducts.flatMap(product => {
      return product.variants.edges.map(edge => edge.node)
        .map(variant => {
          // Strip HTML tags for preview, but keep line breaks
          const cleanDescription = product.description
            ? product.description
                .replace(/<br\s*\/?>/gi, '\n') // Convert <br> to newlines
                .replace(/<[^>]*>/g, '') // Remove other HTML tags
                .trim()
            : '';

          return {
            id: String(variant.id),
            title: variant.title === 'Default Title' ? product.title : `${product.title} - ${variant.title}`,
            description: cleanDescription,
            sku: variant.sku || `SHOPIFY-${variant.id}`,
            price: Number(variant.price),
            variantId: String(variant.id)
          }
        })
    })

    // Try to match products by SKU and include existing matches
    const productsWithMatches = shopifyProducts.map(shopifyProduct => {
      // Check if this product is already matched
      const existingMatch = shopifyToMongoMap.get(shopifyProduct.id)
      
      // If already matched, only show that match
      if (existingMatch) {
        return {
          shopify: shopifyProduct,
          matches: [{
            _id: existingMatch._id,
            name: existingMatch.name,
            sku: existingMatch.sku,
            price: existingMatch.price
          }],
          selectedMatch: existingMatch._id.toString(),
          isExistingMatch: true
        }
      }

      // For unmatched products, find potential matches
      const potentialMatches = unmatched.filter(mongoProduct => {
        // Match by exact SKU if available
        if (shopifyProduct.sku && mongoProduct.sku === shopifyProduct.sku) {
          return true;
        }
        
        // Fuzzy match by name similarity
        const shopifyName = shopifyProduct.title.toLowerCase();
        const mongoName = mongoProduct.name.toLowerCase();
        return shopifyName.includes(mongoName) || mongoName.includes(shopifyName);
      });

      return {
        shopify: shopifyProduct,
        matches: potentialMatches.map(p => ({
          _id: p._id,
          name: p.name,
          sku: p.sku,
          price: p.price
        })),
        isExistingMatch: false
      };
    });

    return NextResponse.json({ 
      products: productsWithMatches,
      totalShopify: shopifyProducts.length,
      totalMongo: existingProducts.length,
      totalMatched: matched.length,
      totalUnmatched: unmatched.length
    })

  } catch (error) {
    console.error('Error fetching Shopify products:', error)
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        // @ts-expect-error Error might have a response field from Shopify client
        response: error.response?.body,
      })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch products' },
      { status: 500 }
    )
  }
} 