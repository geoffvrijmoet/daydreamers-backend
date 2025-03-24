# Product Management Guidelines

This document outlines our approach to managing products across multiple platforms (internal backend, Shopify, and Square) and the synchronization requirements between them.

## Platform Overview

### Shopify
- Primary e-commerce platform
- Supports product variants
- Requires SKUs for all products
- Supports barcodes
- Webhook support for real-time updates

### Square
- Point of sale system
- Supports product variants
- SKUs and barcodes optional
- Webhook support for real-time updates

### Internal Backend
- Source of truth for product data
- Manages inventory across platforms
- Handles cost tracking and profit calculations
- Manages product relationships and variants

## Product Creation Workflows

### 1. Wholesale Order Creation
When a new wholesale order is logged:
1. New products are automatically created in our backend system
2. Products are pushed to Shopify with:
   - SKUs (required)
   - Barcodes (if available)
   - Variants (if applicable)
3. Products are pushed to Square with:
   - Variants (if applicable)
   - SKUs and barcodes (optional)

### 2. Square Webhook Creation
When a new product is created in Square:
1. Webhook triggers product creation in our backend
2. Product is pushed to Shopify with:
   - SKUs (generated if not provided)
   - Variants (if applicable)

### 3. Manual Creation
When manually creating products in our backend:
1. Product is created with all required fields
2. Product is pushed to both Shopify and Square
3. Variants are created if needed

## Product Updates

### Synchronization Rules
1. All product updates should originate in our backend system
2. Updates are pushed to both Shopify and Square
3. Webhook updates from either platform should be validated against our backend data
4. Cost and inventory data is managed primarily in our backend

### Update Priority
1. Backend → Shopify → Square
2. Backend → Square → Shopify
3. Shopify → Backend → Square
4. Square → Backend → Shopify

## Product Variants

### Variant Management
1. Variants should be consistent across all platforms
2. Each variant should have:
   - Unique SKU (for Shopify)
   - Price
   - Stock level
   - Cost tracking
   - Variant-specific metadata

### Variant Relationships
1. Parent-child relationships between variants
2. Proxy relationships for similar products
3. Variant ratios for bulk quantities

## Data Requirements

### Required Fields
- Name
- Description
- Category
- Retail Price
- Current Stock
- Minimum Stock
- Active Status

### Platform-Specific Fields
- Shopify:
  - SKU (required)
  - Barcode (optional)
  - Shopify Product ID
  - Shopify Variant ID
- Square:
  - Square Product ID
  - Square Parent ID (for variants)
  - SKU (optional)
  - Barcode (optional)

### Cost Tracking
- Last Purchase Price
- Average Cost
- Cost History
- Total Spent
- Total Purchased
- Profit Margin Calculation

## Best Practices

1. Always validate data before syncing to external platforms
2. Keep SKUs consistent across platforms when possible
3. Maintain proper variant relationships
4. Track all cost changes and inventory movements
5. Use webhooks for real-time updates
6. Implement proper error handling for failed syncs
7. Log all sync operations for debugging
8. Regular validation of data consistency across platforms

## Error Handling

1. Failed syncs should be logged and retried
2. Data inconsistencies should be flagged for manual review
3. Webhook failures should trigger notifications
4. Regular data validation checks
5. Backup of product data before major updates

## Future Considerations

1. Support for additional platforms
2. Enhanced variant management
3. Automated cost optimization
4. Inventory forecasting
5. Bulk update capabilities
6. Advanced product relationships
7. Integration with supplier systems 

immediate to-do list for this:
- let's make a temporary product management dashboard where we can click on individual products and reassign their "baseProductName", "variantName", and