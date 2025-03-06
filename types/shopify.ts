export interface ShopifySearchResult {
  id: string
  title: string
  variants: Array<{
    id: string
    title: string
    sku?: string
  }>
} 