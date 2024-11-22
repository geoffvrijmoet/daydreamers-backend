export const SALES_TAX_RATE = 0.08875 // 8.875% for Brooklyn, NY

// Calculate pre-tax price from a tax-inclusive price
export function getPreTaxPrice(taxInclusivePrice: number): number {
  return taxInclusivePrice / (1 + SALES_TAX_RATE)
}

// Calculate actual profit margin considering sales tax
export function calculateProfitMargin(retailPriceWithTax: number, cost: number): number {
  const preTaxPrice = getPreTaxPrice(retailPriceWithTax)
  return ((preTaxPrice - cost) / cost) * 100
}

// Calculate profit per unit considering sales tax
export function calculateProfitPerUnit(retailPriceWithTax: number, cost: number): number {
  const preTaxPrice = getPreTaxPrice(retailPriceWithTax)
  return preTaxPrice - cost
} 