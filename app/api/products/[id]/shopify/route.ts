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
      images: data.product.media.edges.map(edge => ({
        id: edge.node.id,
        url: edge.node.mediaContentType === 'IMAGE' 
          ? edge.node.image?.url 
          : edge.node.preview?.image?.url,
        width: edge.node.image?.width,
        height: edge.node.image?.height,
        altText: edge.node.image?.altText
      })).filter(img => img.url),
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

// POST endpoint to create Shopify product or add variant
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { 
      mode,
      existingProductId,
      title, 
      description, 
      vendor, 
      productType, 
      tags, 
      price, 
      compareAtPrice, 
      barcode,
      sku,
      weight,
      weightUnit,
      requiresShipping,
      taxable,
      imageIds = []
    } = body

    let shopifyProduct;

    if (mode === 'variant' && existingProductId) {
      // Add variant to existing product
      const mutation = `
        mutation productVariantCreate($input: ProductVariantInput!) {
          productVariantCreate(input: $input) {
            productVariant {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `

      // For variants, construct the full title by combining parent product title with variant title
      const variantTitle = title.trim();

      const variables = {
        input: {
          productId: existingProductId,
          price: price.toString(),
          compareAtPrice: compareAtPrice?.toString(),
          barcode,
          sku,
          weight,
          weightUnit: weightUnit === 'lb' ? 'POUNDS' :
                     weightUnit === 'oz' ? 'OUNCES' :
                     weightUnit === 'kg' ? 'KILOGRAMS' :
                     'GRAMS',
          requiresShipping,
          taxable,
          options: [variantTitle],
          inventoryItem: {
            tracked: true
          },
          media: imageIds.map(id => ({ mediaId: id }))
        }
      }

      const response = await shopifyClient.graphql(mutation, variables)
      
      if (response.productVariantCreate.userErrors.length > 0) {
        throw new Error(response.productVariantCreate.userErrors[0].message)
      }

      shopifyProduct = {
        variants: [{ id: response.productVariantCreate.productVariant.id }]
      }
    } else {
      // Create new product with GraphQL to support media attachment
      const mutation = `
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id
              variants(first: 1) {
                edges {
                  node {
                    id
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `

      const variables = {
        input: {
          title,
          descriptionHtml: description,
          vendor,
          productType,
          tags: tags.split(',').map((tag: string) => tag.trim()).filter(Boolean),
          variants: [{
            price: price.toString(),
            compareAtPrice: compareAtPrice?.toString(),
            barcode,
            sku,
            weight,
            weightUnit: weightUnit === 'lb' ? 'POUNDS' :
                       weightUnit === 'oz' ? 'OUNCES' :
                       weightUnit === 'kg' ? 'KILOGRAMS' :
                       'GRAMS',
            requiresShipping,
            taxable,
            inventoryItem: {
              tracked: true,
              cost: body.cost?.toString()
            }
          }]
        }
      }

      const response = await shopifyClient.graphql(mutation, variables)
      
      if (response.productCreate.userErrors.length > 0) {
        throw new Error(response.productCreate.userErrors[0].message)
      }

      const productId = response.productCreate.product.id
      const variantId = response.productCreate.product.variants.edges[0].node.id

      // If we have images, attach them to the product
      if (imageIds.length > 0) {
        const attachMediaMutation = `
          mutation productAppendMedia($input: ProductAppendMediaInput!) {
            productAppendMedia(input: $input) {
              product {
                id
              }
              mediaUserErrors {
                field
                message
              }
            }
          }
        `

        const mediaResponse = await shopifyClient.graphql(attachMediaMutation, {
          input: {
            productId,
            mediaIds: imageIds
          }
        })

        if (mediaResponse.productAppendMedia.mediaUserErrors.length > 0) {
          throw new Error(mediaResponse.productAppendMedia.mediaUserErrors[0].message)
        }
      }

      shopifyProduct = {
        variants: [{
          id: variantId
        }]
      }
    }

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