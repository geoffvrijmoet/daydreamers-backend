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
  const updates: any = {}
  
  for (const secondary of secondaryTransactions) {
    // Merge platformMetadata if primary doesn't have it
    if (!primaryTransaction.platformMetadata && secondary.platformMetadata) {
      updates.platformMetadata = secondary.platformMetadata
      hasUpdates = true
      console.log(`Merged platformMetadata from ${secondary._id}`)
    }
    
    // Merge products if primary doesn't have them
    if ((!primaryTransaction as any).products && (secondary as any).products) {
      updates.products = (secondary as any).products
      hasUpdates = true
      console.log(`Merged products from ${secondary._id}`)
    }
    
    // Merge lineItems if primary doesn't have them (for old format)
    if ((!primaryTransaction as any).lineItems && (secondary as any).lineItems) {
      updates.lineItems = (secondary as any).lineItems
      hasUpdates = true
      console.log(`Merged lineItems from ${secondary._id}`)
    }
    
    // Merge other fields if primary is missing them
    if (!primaryTransaction.preTaxAmount && (secondary as any).preTaxAmount) {
      updates.preTaxAmount = (secondary as any).preTaxAmount
      hasUpdates = true
    }
    
    if (!primaryTransaction.isTaxable && (secondary as any).isTaxable) {
      updates.isTaxable = (secondary as any).isTaxable
      hasUpdates = true
    }
    
    if (!primaryTransaction.draft && (secondary as any).draft !== undefined) {
      updates.draft = (secondary as any).draft
      hasUpdates = true
    }
    
    // Merge customer info if primary doesn't have it
    if (!primaryTransaction.customer && (secondary as any).customer) {
      updates.customer = (secondary as any).customer
      hasUpdates = true
    }
    
    if (!primaryTransaction.email && (secondary as any).email) {
      updates.email = (secondary as any).email
      hasUpdates = true
    }
    
    // Merge payment method if primary doesn't have it
    if (!primaryTransaction.paymentMethod && (secondary as any).paymentMethod) {
      updates.paymentMethod = (secondary as any).paymentMethod
      hasUpdates = true
    }
    
    // Merge tip if primary doesn't have it
    if (!primaryTransaction.tip && (secondary as any).tip) {
      updates.tip = (secondary as any).tip
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
