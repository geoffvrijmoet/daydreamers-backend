import { NextResponse } from 'next/server'
import { shopifyClient } from '@/lib/shopify'
import { getDb } from '@/lib/db'
import { ObjectId } from 'mongodb'

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
    const db = await getDb()
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
          variants(first: 10) {
            edges {
              node {
                id
                title
                price
                compareAtPrice
                barcode
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
    const data = await shopifyClient.graphql(query, variables)

    // Transform the GraphQL response to match our expected format
    const variants = data.product.variants.edges.map(edge => ({
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
      variants
    }

    return NextResponse.json(shopifyProduct)
  } catch (error) {
    console.error('Error fetching Shopify product:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Shopify product' },
      { status: 500 }
    )
  }
}

// POST endpoint to create Shopify product
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { 
      title, 
      description, 
      vendor, 
      productType, 
      tags, 
      price, 
      compareAtPrice, 
      barcode,
      weight,
      weightUnit,
      requiresShipping,
      taxable
    } = body

    // Create product in Shopify
    const shopifyProduct = await shopifyClient.product.create({
      title,
      body_html: description,
      vendor,
      product_type: productType,
      tags: tags.split(',').map((tag: string) => tag.trim()).filter(Boolean),
      variants: [{
        price: price.toString(),
        compare_at_price: compareAtPrice?.toString(),
        barcode,
        weight,
        weight_unit: weightUnit,
        requires_shipping: requiresShipping,
        taxable
      }]
    })

    // Update our database with the Shopify ID
    const db = await getDb()
    await db.collection('products').updateOne(
      { _id: new ObjectId(params.id) },
      { 
        $set: { 
          shopifyId: shopifyProduct.variants[0].id.toString(),
          shopifyVariantId: shopifyProduct.variants[0].id.toString(),
          updatedAt: new Date()
        } 
      }
    )

    return NextResponse.json(shopifyProduct)
  } catch (error) {
    console.error('Error creating Shopify product:', error)
    return NextResponse.json(
      { error: 'Failed to create Shopify product' },
      { status: 500 }
    )
  }
}

// PATCH endpoint to update Shopify product
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

    // Get product from MongoDB to verify ownership
    const db = await getDb()
    const product = await db.collection('products').findOne({
      _id: new ObjectId(params.id)
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const shopifyProduct = await shopifyClient.product.update(Number(variantId), body)

    return NextResponse.json(shopifyProduct)
  } catch (error) {
    console.error('Error updating Shopify product:', error)
    return NextResponse.json(
      { error: 'Failed to update Shopify product' },
      { status: 500 }
    )
  }
} 