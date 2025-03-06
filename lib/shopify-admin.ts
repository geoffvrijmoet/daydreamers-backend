import { GraphQLClient } from 'graphql-request'

if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || !process.env.SHOPIFY_SHOP_NAME) {
  throw new Error('Missing required Shopify Admin environment variables')
}

export const shopifyAdmin = new GraphQLClient(
  `https://${process.env.SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2024-01/graphql.json`,
  {
    headers: {
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    },
  }
) 