import { NextResponse } from 'next/server'
import { shopifyClient } from '@/lib/shopify'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import { ObjectId } from 'mongodb'

// Add these interfaces before the GET function
interface ShopifyVariantNode {
  id: string
  title: string
  price: string
  compareAtPrice: string | null
  barcode: string | null
  sku: string | null
  weight: number
  weightUnit: string
  requiresShipping: boolean
  taxable: boolean
  inventoryQuantity: number
  selectedOptions: { name: string; value: string }[]
}

interface ShopifyMediaNode {
  id: string
  mediaContentType: string
  image?: {
    url: string
    width: number
    height: number
    altText: string
  }
  preview?: {
    image: {
      url: string
    }
  }
}

interface ShopifyGraphQLResponse {
  product: {
    id: string
    title: string
    description: string
    vendor: string
    productType: string
    tags: string[]
    status: string
    publishedAt: string
    media: {
      edges: Array<{ node: ShopifyMediaNode }>
    }
    variants: {
      edges: Array<{ node: ShopifyVariantNode }>
    }
  }
}

interface ProductInput {
  title: string
  descriptionHtml: string
  vendor: string
  productType: string
  status: string
  options: Array<{
    name: string
    values: string[]
  }>
  variants: Array<{
    options: string[]
    price: string
    compareAtPrice: string | null
    barcode: string
    sku: string
    weight: number
    weightUnit: "GRAMS" | "KILOGRAMS" | "OUNCES" | "POUNDS"
    requiresShipping: boolean
    taxable: boolean
    inventoryManagement: "SHOPIFY"
  }>
  tags?: string[]
}

export interface VariantInput {
  price: string
  compareAtPrice?: string
  barcode?: string
  sku: string
  weight: number
  weightUnit: "GRAMS" | "KILOGRAMS" | "OUNCES" | "POUNDS"
  requiresShipping: boolean
  taxable: boolean
}

// Helper to extract product ID from variant GID
const extractProductIdFromVariantGid = async (variantId: string) => {
  try {
    // First, get the variant details to find its product ID
    const query = `
      query getProductIdFromVariant($id: ID!) {
        productVariant(id: $id) {
          product {
            id
          }
        }
      }
    `
    const variables = {
      id: `gid://shopify/ProductVariant/${variantId}`
    }

    const response = await shopifyClient.graphql(query, variables)
    return response.productVariant?.product?.id
  } catch (error) {
    console.error('Error getting product ID from variant:', error)
    return null
  }
}

// GET endpoint to fetch Shopify product data
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const variantId = searchParams.get('variantId')

    if (!variantId) {
      return NextResponse.json(
        { error: 'variantId is required' },
        { status: 400 }
      )
    }

    // Validate MongoDB ID format
    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { error: 'Invalid product ID format' },
        { status: 400 }
      )
    }

    // Get product from MongoDB to verify Shopify ID
    await connectToDatabase()
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
    const product = await db.collection('products').findOne({
      _id: new ObjectId(params.id)
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Get the Shopify product ID from the variant ID
    const productId = await extractProductIdFromVariantGid(variantId)
    if (!productId) {
      return NextResponse.json(
        { error: 'Failed to find Shopify product' },
        { status: 404 }
      )
    }

    // Fetch full product data using GraphQL
    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          description
          vendor
          productType
          tags
          status
          publishedAt
          media(first: 20) {
            edges {
              node {
                id
                mediaContentType
                ... on MediaImage {
                  id
                  image {
                    url
                    width
                    height
                    altText
                  }
                }
                preview {
                  image {
                    url
                  }
                }
              }
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                price
                compareAtPrice
                barcode
                sku
                weight
                weightUnit
                requiresShipping
                taxable
                inventoryQuantity
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    `
    const variables = { id: productId }
    const data = await shopifyClient.graphql(query, variables) as { product: ShopifyGraphQLResponse['product'] }

    // Transform the GraphQL response to match our expected format
    const variants = data.product.variants.edges.map((edge: { node: ShopifyVariantNode }) => ({
      id: edge.node.id,
      title: edge.node.title,
      price: edge.node.price || "0.00",
      compare_at_price: edge.node.compareAtPrice,
      barcode: edge.node.barcode,
      weight: edge.node.weight || 0,
      weight_unit: edge.node.weightUnit || "lb",
      requires_shipping: edge.node.requiresShipping || true,
      taxable: edge.node.taxable || true,
      inventory_quantity: edge.node.inventoryQuantity || 0,
      options: edge.node.selectedOptions
    }))

    const shopifyProduct = {
      id: data.product.id,
      title: data.product.title,
      body_html: data.product.description,
      vendor: data.product.vendor,
      product_type: data.product.productType,
      tags: data.product.tags,
      status: data.product.status,
      published_at: data.product.publishedAt,
      images: data.product.media.edges.map((edge: { node: ShopifyMediaNode }) => ({
        id: edge.node.id,
        src: edge.node.image?.url || edge.node.preview?.image.url,
        width: edge.node.image?.width,
        height: edge.node.image?.height,
        alt: edge.node.image?.altText
      })),
      variants
    }

    return NextResponse.json({ product: shopifyProduct })
  } catch (error) {
    console.error('Error fetching Shopify product:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch product' },
      { status: 500 }
    )
  }
}

// POST endpoint to create a new Shopify product
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const variantId = searchParams.get('variantId')

    if (!variantId) {
      return NextResponse.json(
        { error: 'variantId is required' },
        { status: 400 }
      )
    }

    // Validate MongoDB ID format
    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { error: 'Invalid product ID format' },
        { status: 400 }
      )
    }

    // Get product from MongoDB
    await connectToDatabase()
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
    const product = await db.collection('products').findOne({
      _id: new ObjectId(params.id)
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Check if product is already synced with Shopify
    if (product.shopifyId) {
      return NextResponse.json(
        { error: 'Product is already synced with Shopify' },
        { status: 400 }
      )
    }

    // Create Shopify product
    const productInput: ProductInput = {
      title: product.name,
      descriptionHtml: product.description || '',
      vendor: 'Daydreamers',
      productType: product.category || 'Uncategorized',
      status: 'ACTIVE',
      options: [
        {
          name: 'Title',
          values: ['Default Title']
        }
      ],
      variants: [
        {
          options: ['Default Title'],
          price: product.retailPrice.toString(),
          compareAtPrice: null,
          barcode: product.sku || '',
          sku: product.sku || '',
          weight: 0,
          weightUnit: "POUNDS",
          requiresShipping: true,
          taxable: true,
          inventoryManagement: "SHOPIFY"
        }
      ],
      tags: ['daydreamers']
    }

    const response = await shopifyClient.product.create(productInput)
    const shopifyProduct = response as unknown as { id: string; variants: Array<{ id: string }> }

    // Update MongoDB product with Shopify IDs
    await db.collection('products').updateOne(
      { _id: new ObjectId(params.id) },
      {
        $set: {
          shopifyId: shopifyProduct.id,
          shopifyVariantId: shopifyProduct.variants[0].id,
          updatedAt: new Date().toISOString()
        }
      }
    )

    return NextResponse.json({
      message: 'Product created in Shopify',
      shopifyId: shopifyProduct.id,
      shopifyVariantId: shopifyProduct.variants[0].id
    })
  } catch (error) {
    console.error('Error creating Shopify product:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create product' },
      { status: 500 }
    )
  }
}

// PATCH endpoint to update a Shopify product
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const variantId = searchParams.get('variantId')

    if (!variantId) {
      return NextResponse.json(
        { error: 'variantId is required' },
        { status: 400 }
      )
    }

    // Validate MongoDB ID format
    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { error: 'Invalid product ID format' },
        { status: 400 }
      )
    }

    // Get product from MongoDB
    await connectToDatabase()
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 500 });
    }
    const product = await db.collection('products').findOne({
      _id: new ObjectId(params.id)
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Check if product is synced with Shopify
    if (!product.shopifyId) {
      return NextResponse.json(
        { error: 'Product is not synced with Shopify' },
        { status: 400 }
      )
    }

    // Update Shopify product
    const variantInput: VariantInput = {
      price: product.retailPrice.toString(),
      sku: product.sku || '',
      weight: 0,
      weightUnit: "POUNDS",
      requiresShipping: true,
      taxable: true
    }

    await shopifyClient.productVariant.update(Number(variantId), variantInput)

    return NextResponse.json({
      message: 'Product updated in Shopify'
    })
  } catch (error) {
    console.error('Error updating Shopify product:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update product' },
      { status: 500 }
    )
  }
} 