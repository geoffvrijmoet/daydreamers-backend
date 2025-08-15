import TransactionModel from '@/lib/models/transaction'

// Function to merge duplicate transactions for any platform
export async function mergeDuplicateTransactions(orderId: string, platform: 'shopify' | 'square') {
  console.log(`Checking for duplicate ${platform} transactions for order ${orderId}`)
  
  // Build detection queries based on platform
  const detectionQueries = []
  
  if (platform === 'shopify') {
    detectionQueries.push(
      { 'platformMetadata.orderId': orderId },
      { shopifyOrderId: orderId },
      { id: `shopify_${orderId}` },
      { 'paymentProcessing.transactionId': orderId }
    )
  } else if (platform === 'square') {
    detectionQueries.push(
      { 'platformMetadata.orderId': orderId },
      { id: `square_${orderId}` },
      { 'paymentProcessing.transactionId': orderId },
      { 'paymentProcessing.transactionId': `square_${orderId}` }
    )
  }
  
  // Find all transactions that could be for this order
  const duplicates = await TransactionModel.find({
    $or: detectionQueries
  }).sort({ createdAt: -1 }) // Sort by creation date, newest first
  
  if (duplicates.length <= 1) {
    console.log(`No duplicates found for ${platform} order ${orderId}`)
    return duplicates[0] || null
  }
  
  console.log(`Found ${duplicates.length} duplicate ${platform} transactions for order ${orderId}`)
  
  // Debug: Show createdAt values for all duplicates
  duplicates.forEach((dup, index) => {
    console.log(`  Duplicate ${index + 1}: ${dup._id} - createdAt: ${dup.createdAt} (type: ${typeof dup.createdAt})`)
  })
  
  // Keep the newest transaction (first in array) and merge data from others
  const primaryTransaction = duplicates[0]
  const secondaryTransactions = duplicates.slice(1)
  
  console.log(`Keeping newest transaction: ${primaryTransaction._id} (created: ${primaryTransaction.createdAt})`)
  console.log(`Merging ${secondaryTransactions.length} older transactions`)
  
  // Merge data from secondary transactions into primary
  let hasUpdates = false
  const updates: Record<string, unknown> = {}
  
  for (const secondary of secondaryTransactions) {
    // Merge platformMetadata if primary doesn't have it
    if (!primaryTransaction.platformMetadata && secondary.platformMetadata) {
      updates.platformMetadata = secondary.platformMetadata
      hasUpdates = true
      console.log(`Merged platformMetadata from ${secondary._id}`)
    }
    
    // Merge products if primary doesn't have them
    if (!(primaryTransaction as { products?: unknown[] }).products && (secondary as { products?: unknown[] }).products) {
      updates.products = (secondary as { products?: unknown[] }).products
      hasUpdates = true
      console.log(`Merged products from ${secondary._id}`)
    }
    
    // Merge lineItems if primary doesn't have them (for old format)
    if (!(primaryTransaction as { lineItems?: unknown[] }).lineItems && (secondary as { lineItems?: unknown[] }).lineItems) {
      updates.lineItems = (secondary as { lineItems?: unknown[] }).lineItems
      hasUpdates = true
      console.log(`Merged lineItems from ${secondary._id}`)
    }
    
    // Merge other fields if primary is missing them
    if (!(primaryTransaction as { preTaxAmount?: number }).preTaxAmount && (secondary as { preTaxAmount?: number }).preTaxAmount) {
      updates.preTaxAmount = (secondary as { preTaxAmount?: number }).preTaxAmount
      hasUpdates = true
    }
    
    if (!(primaryTransaction as { isTaxable?: boolean }).isTaxable && (secondary as { isTaxable?: boolean }).isTaxable) {
      updates.isTaxable = (secondary as { isTaxable?: boolean }).isTaxable
      hasUpdates = true
    }
    
    if (!(primaryTransaction as { draft?: boolean }).draft && (secondary as { draft?: boolean }).draft !== undefined) {
      updates.draft = (secondary as { draft?: boolean }).draft
      hasUpdates = true
    }
    
    // Merge customer info if primary doesn't have it
    if (!(primaryTransaction as { customer?: string }).customer && (secondary as { customer?: string }).customer) {
      updates.customer = (secondary as { customer?: string }).customer
      hasUpdates = true
    }
    
    if (!(primaryTransaction as { email?: string }).email && (secondary as { email?: string }).email) {
      updates.email = (secondary as { email?: string }).email
      hasUpdates = true
    }
    
    // Merge payment method if primary doesn't have it
    if (!(primaryTransaction as { paymentMethod?: string }).paymentMethod && (secondary as { paymentMethod?: string }).paymentMethod) {
      updates.paymentMethod = (secondary as { paymentMethod?: string }).paymentMethod
      hasUpdates = true
    }
    
    // Merge tip if primary doesn't have it
    if (!(primaryTransaction as { tip?: number }).tip && (secondary as { tip?: number }).tip) {
      updates.tip = (secondary as { tip?: number }).tip
      hasUpdates = true
    }
  }
  
  // Update primary transaction with merged data
  if (hasUpdates) {
    updates.updatedAt = new Date()
    await TransactionModel.findByIdAndUpdate(primaryTransaction._id, { $set: updates })
    console.log(`Updated primary transaction ${primaryTransaction._id} with merged data`)
  }
  
  // Delete secondary transactions
  const secondaryIds = secondaryTransactions.map(t => t._id)
  await TransactionModel.deleteMany({ _id: { $in: secondaryIds } })
  console.log(`Deleted ${secondaryTransactions.length} duplicate transactions:`, secondaryIds)
  
  // Return the updated primary transaction
  const updatedPrimary = await TransactionModel.findById(primaryTransaction._id)
  console.log(`Merge complete for ${platform} order ${orderId}. Final transaction: ${updatedPrimary?._id}`)
  
  return updatedPrimary
}
