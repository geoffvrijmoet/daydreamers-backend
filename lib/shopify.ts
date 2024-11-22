import Shopify from 'shopify-api-node'

if (!process.env.SHOPIFY_SHOP_NAME || !process.env.SHOPIFY_ACCESS_TOKEN) {
  throw new Error('Shopify credentials are not defined')
}

export const shopifyClient = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_NAME,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  apiVersion: '2024-01' // Latest stable version
}) 