import mongoose from 'mongoose'

// Lazy import to avoid module loading issues
let InventoryChangeModel: any = null
async function getInventoryChangeModel(): Promise<any> {
  if (!InventoryChangeModel) {
    try {
      const { InventoryChangeModel: Model } = await import('@/lib/models/inventory-change')
      InventoryChangeModel = Model
    } catch (error) {
      console.error('[Inventory] Failed to import InventoryChangeModel:', error)
      return null
    }
  }
  return InventoryChangeModel
}

interface ProductInTransaction {
  productId: mongoose.Types.ObjectId | string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
  isTaxable?: boolean
  costDiscount?: number
}

export interface InventoryUpdateResult {
  productId: string
  productName: string
  oldStock: number
  newStock: number
  quantityChange: number
  success: boolean
  error?: string
  changeRecorded?: boolean
}

// Type for products from the modal (with optional productId)
interface ModalLineItem {
  productId?: string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
  isTaxable?: boolean
}

// Helper function to convert modal line items to inventory-compatible format
export function convertModalLineItemsToInventoryFormat(products: ModalLineItem[]): ProductInTransaction[] {
  return products
    .filter(product => product.productId && product.name && product.quantity > 0)
    .map(product => ({
      productId: product.productId!,
      name: product.name,
      quantity: product.quantity,
      unitPrice: product.unitPrice,
      totalPrice: product.totalPrice,
      isTaxable: product.isTaxable || false
    }));
}

/**
 * Records an inventory change in the tracking collection
 */
async function recordInventoryChange(
  transactionId: string,
  productId: string,
  quantityChange: number,
  changeType: 'sale' | 'purchase' | 'adjustment' | 'restoration',
  productName: string,
  transactionType: 'sale' | 'expense' | 'training',
  source: string,
  notes?: string
): Promise<boolean> {
  try {
    const Model = await getInventoryChangeModel()
    if (!Model) {
      console.warn('[Inventory] InventoryChangeModel not available, skipping record')
      return false
    }
    
    await Model.create({
      transactionId: new mongoose.Types.ObjectId(transactionId),
      productId: new mongoose.Types.ObjectId(productId),
      quantityChange,
      changeType,
      productName,
      transactionType,
      source,
      notes
    })
    return true
  } catch (error) {
    if (error instanceof Error && error.message.includes('duplicate key')) {
      console.log(`[Inventory] Change already recorded for transaction ${transactionId}, product ${productId}`)
      return false // Already recorded
    }
    console.error(`[Inventory] Error recording inventory change:`, error)
    return false
  }
}

/**
 * Checks if an inventory change has already been recorded for a transaction/product combination
 */
async function hasInventoryChangeBeenRecorded(
  transactionId: string,
  productId: string
): Promise<boolean> {
  try {
    const Model = await getInventoryChangeModel()
    if (!Model) {
      console.warn('[Inventory] InventoryChangeModel not available, skipping check')
      return false
    }
    
    const existingChange = await Model.findOne({
      transactionId: new mongoose.Types.ObjectId(transactionId),
      productId: new mongoose.Types.ObjectId(productId)
    })
    return !!existingChange
  } catch (error) {
    console.error(`[Inventory] Error checking for existing inventory change:`, error)
    return false
  }
}

/**
 * Updates inventory for Viva Raw products when a transaction is created
 * @param products Array of products in the transaction
 * @param transactionId The ID of the transaction (optional, for tracking)
 * @param transactionType The type of transaction (optional, for tracking)
 * @param source The source of the transaction (optional, for tracking)
 * @returns Array of inventory update results
 */
export async function updateInventoryForNewTransaction(
  products: ProductInTransaction[],
  transactionId?: string,
  transactionType: 'sale' | 'expense' | 'training' = 'sale',
  source: string = 'manual'
): Promise<InventoryUpdateResult[]> {
  // Filter out products with invalid names or missing productIds
  const validProducts = products.filter(product => 
    product.name && 
    product.name.trim() !== '' && 
    product.productId && 
    product.quantity > 0
  );

  if (validProducts.length !== products.length) {
    console.warn('[Inventory] Filtered out invalid products:', {
      total: products.length,
      valid: validProducts.length,
      invalid: products.filter(p => !p.name || !p.name.trim() || !p.productId || p.quantity <= 0)
    });
  }
  const results: InventoryUpdateResult[] = []

  for (const product of validProducts) {
    try {
      // Convert productId to ObjectId if it's a string
      const productId = typeof product.productId === 'string' 
        ? new mongoose.Types.ObjectId(product.productId)
        : product.productId

      const productIdString = productId.toString()

      // Check if this change has already been recorded (for sync operations)
      if (transactionId && await hasInventoryChangeBeenRecorded(transactionId, productIdString)) {
        console.log(`[Inventory] Skipping inventory update for transaction ${transactionId}, product ${product.name} - already processed`)
        results.push({
          productId: productIdString,
          productName: product.name,
          oldStock: 0,
          newStock: 0,
          quantityChange: 0,
          success: true,
          changeRecorded: false
        })
        continue
      }

      // Find the product in the database
      const productDoc = await mongoose.connection.db!.collection('products').findOne({
        _id: productId,
        supplier: 'Viva Raw'
      })

      if (!productDoc) {
        results.push({
          productId: productIdString,
          productName: product.name,
          oldStock: 0,
          newStock: 0,
          quantityChange: product.quantity,
          success: false,
          error: 'Product not found or not a Viva Raw product'
        })
        continue
      }

      const oldStock = productDoc.stock || 0
      const newStock = Math.max(0, oldStock - product.quantity) // Prevent negative stock

      // Update the product's stock
      await mongoose.connection.db!.collection('products').updateOne(
        { _id: productId },
        { $set: { stock: newStock, updatedAt: new Date() } }
      )

      // Record the inventory change if we have a transaction ID
      let changeRecorded = false
      if (transactionId) {
        changeRecorded = await recordInventoryChange(
          transactionId,
          productIdString,
          -product.quantity, // Negative for sales
          'sale',
          product.name,
          transactionType,
          source
        )
      }

      results.push({
        productId: productIdString,
        productName: product.name,
        oldStock,
        newStock,
        quantityChange: -product.quantity, // Negative because we're reducing stock
        success: true,
        changeRecorded
      })

      console.log(`[Inventory] Updated Viva Raw product ${product.name}: ${oldStock} → ${newStock} (-${product.quantity})`)
    } catch (error) {
      results.push({
        productId: (typeof product.productId === 'string' ? product.productId : product.productId.toString()),
        productName: product.name,
        oldStock: 0,
        newStock: 0,
        quantityChange: product.quantity,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      console.error(`[Inventory] Error updating inventory for product ${product.name}:`, error)
    }
  }

  return results
}

/**
 * Increases inventory for Viva Raw products when an expense transaction is created (purchases received)
 * @param products Array of products in the expense transaction
 * @param transactionId The ID of the transaction (optional, for tracking)
 * @param source The source of the transaction (optional, for tracking)
 * @returns Array of inventory update results
 */
export async function increaseInventoryForNewExpense(
  products: ProductInTransaction[],
  transactionId?: string,
  source: string = 'manual'
): Promise<InventoryUpdateResult[]> {
  // Filter out products with invalid names or missing productIds
  const validProducts = products.filter(product => 
    product.name && 
    product.name.trim() !== '' && 
    product.productId && 
    product.quantity > 0
  )

  if (validProducts.length !== products.length) {
    console.warn('[Inventory] (Expense New) Filtered out invalid products:', {
      total: products.length,
      valid: validProducts.length,
      invalid: products.filter(p => !p.name || !p.name.trim() || !p.productId || p.quantity <= 0)
    })
  }

  const results: InventoryUpdateResult[] = []

  for (const product of validProducts) {
    try {
      const productId = typeof product.productId === 'string'
        ? new mongoose.Types.ObjectId(product.productId)
        : product.productId

      const productIdString = productId.toString()

      // Check if this change has already been recorded (for sync operations)
      if (transactionId && await hasInventoryChangeBeenRecorded(transactionId, productIdString)) {
        console.log(`[Inventory] Skipping inventory increase for transaction ${transactionId}, product ${product.name} - already processed`)
        results.push({
          productId: productIdString,
          productName: product.name,
          oldStock: 0,
          newStock: 0,
          quantityChange: 0,
          success: true,
          changeRecorded: false
        })
        continue
      }

      const productDoc = await mongoose.connection.db!.collection('products').findOne({
        _id: productId,
        supplier: 'Viva Raw'
      })

      if (!productDoc) {
        results.push({
          productId: productIdString,
          productName: product.name,
          oldStock: 0,
          newStock: 0,
          quantityChange: product.quantity,
          success: false,
          error: 'Product not found or not a Viva Raw product'
        })
        continue
      }

      const oldStock = productDoc.stock || 0
      const newStock = Math.max(0, oldStock + product.quantity)

      await mongoose.connection.db!.collection('products').updateOne(
        { _id: productId },
        { $set: { stock: newStock, updatedAt: new Date() } }
      )

      // Record the inventory change if we have a transaction ID
      let changeRecorded = false
      if (transactionId) {
        changeRecorded = await recordInventoryChange(
          transactionId,
          productIdString,
          product.quantity, // Positive for purchases
          'purchase',
          product.name,
          'expense',
          source
        )
      }

      results.push({
        productId: productIdString,
        productName: product.name,
        oldStock,
        newStock,
        quantityChange: product.quantity, // Positive because we're increasing stock
        success: true,
        changeRecorded
      })

      console.log(`[Inventory] (Expense New) Increased Viva Raw product ${product.name}: ${oldStock} → ${newStock} (+${product.quantity})`)
    } catch (error) {
      results.push({
        productId: (typeof product.productId === 'string' ? product.productId : product.productId.toString()),
        productName: product.name,
        oldStock: 0,
        newStock: 0,
        quantityChange: product.quantity,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      console.error(`[Inventory] (Expense New) Error increasing inventory for product ${product.name}:`, error)
    }
  }

  return results
}

/**
 * Updates inventory for Viva Raw products when a transaction is updated
 * @param transactionId The ID of the transaction being updated
 * @param newProducts Array of products in the updated transaction
 * @returns Array of inventory update results
 */
export async function updateInventoryForExistingTransaction(
  transactionId: string,
  newProducts: ProductInTransaction[]
): Promise<InventoryUpdateResult[]> {
  // Filter out products with invalid names or missing productIds
  const validNewProducts = newProducts.filter(product => 
    product.name && 
    product.name.trim() !== '' && 
    product.productId && 
    product.quantity > 0
  );

  if (validNewProducts.length !== newProducts.length) {
    console.warn('[Inventory] Filtered out invalid products in update:', {
      total: newProducts.length,
      valid: validNewProducts.length,
      invalid: newProducts.filter(p => !p.name || !p.name.trim() || !p.productId || p.quantity <= 0)
    });
  }
  const results: InventoryUpdateResult[] = []

  try {
    // Get the existing transaction to compare quantities
    const existingTransaction = await mongoose.connection.db!.collection('transactions').findOne({
      _id: new mongoose.Types.ObjectId(transactionId)
    })

    if (!existingTransaction) {
      throw new Error('Transaction not found')
    }

    const existingProducts = existingTransaction.products || []
    
    // Create a map of existing products by productId for easy lookup
    const existingProductMap = new Map<string, ProductInTransaction>()
    for (const product of existingProducts) {
      const productId = (typeof product.productId === 'string' ? product.productId : product.productId.toString())
      existingProductMap.set(productId, product)
    }

    // Create a map of new products by productId for easy lookup
    const newProductMap = new Map<string, ProductInTransaction>()
    for (const product of validNewProducts) {
      const productId = (typeof product.productId === 'string' ? product.productId : product.productId.toString())
      newProductMap.set(productId, product)
    }

    // Process each new product
    for (const newProduct of validNewProducts) {
      try {
        const newProductId = (typeof newProduct.productId === 'string' ? newProduct.productId : newProduct.productId.toString())
        const existingProduct = existingProductMap.get(newProductId)

        // If product didn't exist before, treat it as a new addition
        if (!existingProduct) {
          const result = await updateInventoryForNewTransaction([newProduct], transactionId, 'sale', 'manual')
          results.push(...result)
          continue
        }

        // Calculate the difference in quantity
        const quantityDifference = newProduct.quantity - existingProduct.quantity

        // If quantities are the same, no inventory change needed
        if (quantityDifference === 0) {
          results.push({
            productId: newProductId,
            productName: newProduct.name,
            oldStock: 0,
            newStock: 0,
            quantityChange: 0,
            success: true
          })
          continue
        }

        // Convert productId to ObjectId
        const productId = typeof newProduct.productId === 'string' 
          ? new mongoose.Types.ObjectId(newProduct.productId)
          : newProduct.productId

        // Find the product in the database
        const productDoc = await mongoose.connection.db!.collection('products').findOne({
          _id: productId,
          supplier: 'Viva Raw'
        })

        if (!productDoc) {
          results.push({
            productId: newProductId,
            productName: newProduct.name,
            oldStock: 0,
            newStock: 0,
            quantityChange: quantityDifference,
            success: false,
            error: 'Product not found or not a Viva Raw product'
          })
          continue
        }

        const oldStock = productDoc.stock || 0
        // If quantityDifference is positive, we're adding more items (reducing stock)
        // If quantityDifference is negative, we're removing items (increasing stock)
        const newStock = Math.max(0, oldStock - quantityDifference)

        // Update the product's stock
        await mongoose.connection.db!.collection('products').updateOne(
          { _id: productId },
          { $set: { stock: newStock, updatedAt: new Date() } }
        )

        results.push({
          productId: newProductId,
          productName: newProduct.name,
          oldStock,
          newStock,
          quantityChange: -quantityDifference, // Negative because we're reducing stock
          success: true
        })

        console.log(`[Inventory] Updated Viva Raw product ${newProduct.name}: ${oldStock} → ${newStock} (${quantityDifference > 0 ? '-' : '+'}${Math.abs(quantityDifference)})`)
      } catch (error) {
        results.push({
          productId: (typeof newProduct.productId === 'string' ? newProduct.productId : newProduct.productId.toString()),
          productName: newProduct.name,
          oldStock: 0,
          newStock: 0,
          quantityChange: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        console.error(`[Inventory] Error updating inventory for product ${newProduct.name}:`, error)
      }
    }

    // Handle products that were removed from the transaction
    for (const existingProduct of existingProducts) {
      const existingProductId = (typeof existingProduct.productId === 'string' ? existingProduct.productId : existingProduct.productId.toString())
      
      if (!newProductMap.has(existingProductId)) {
        // Product was removed from transaction, so we need to add back to inventory
        try {
          const productId = typeof existingProduct.productId === 'string' 
            ? new mongoose.Types.ObjectId(existingProduct.productId)
            : existingProduct.productId

          const productDoc = await mongoose.connection.db!.collection('products').findOne({
            _id: productId,
            supplier: 'Viva Raw'
          })

          if (productDoc) {
            const oldStock = productDoc.stock || 0
            const newStock = oldStock + existingProduct.quantity

            await mongoose.connection.db!.collection('products').updateOne(
              { _id: productId },
              { $set: { stock: newStock, updatedAt: new Date() } }
            )

            results.push({
              productId: existingProductId,
              productName: existingProduct.name,
              oldStock,
              newStock,
              quantityChange: existingProduct.quantity, // Positive because we're adding back to stock
              success: true
            })

            console.log(`[Inventory] Restored Viva Raw product ${existingProduct.name}: ${oldStock} → ${newStock} (+${existingProduct.quantity})`)
          }
        } catch (error) {
          results.push({
            productId: existingProductId,
            productName: existingProduct.name,
            oldStock: 0,
            newStock: 0,
            quantityChange: existingProduct.quantity,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          console.error(`[Inventory] Error restoring inventory for removed product ${existingProduct.name}:`, error)
        }
      }
    }

  } catch (error) {
    console.error('[Inventory] Error in updateInventoryForExistingTransaction:', error)
    throw error
  }

  return results
}

/**
 * Increases inventory for Viva Raw products when an existing expense transaction is updated
 * @param transactionId The ID of the expense transaction being updated
 * @param newProducts Array of products in the updated transaction
 * @returns Array of inventory update results
 */
export async function increaseInventoryForExistingExpense(
  transactionId: string,
  newProducts: ProductInTransaction[]
): Promise<InventoryUpdateResult[]> {
  const validNewProducts = newProducts.filter(product => 
    product.name && 
    product.name.trim() !== '' && 
    product.productId && 
    product.quantity > 0
  )

  if (validNewProducts.length !== newProducts.length) {
    console.warn('[Inventory] (Expense Update) Filtered out invalid products in update:', {
      total: newProducts.length,
      valid: validNewProducts.length,
      invalid: newProducts.filter(p => !p.name || !p.name.trim() || !p.productId || p.quantity <= 0)
    })
  }

  const results: InventoryUpdateResult[] = []

  try {
    const existingTransaction = await mongoose.connection.db!.collection('transactions').findOne({
      _id: new mongoose.Types.ObjectId(transactionId)
    })

    if (!existingTransaction) {
      throw new Error('Transaction not found')
    }

    const existingProducts = existingTransaction.products || []
    const existingProductMap = new Map<string, ProductInTransaction>()
    for (const product of existingProducts) {
      const productId = (typeof product.productId === 'string' ? product.productId : product.productId.toString())
      existingProductMap.set(productId, product)
    }

    for (const newProduct of validNewProducts) {
      try {
        const newProductId = (typeof newProduct.productId === 'string' ? newProduct.productId : newProduct.productId.toString())
        const existingProduct = existingProductMap.get(newProductId)

        // Treat new additions as new stock increases
        if (!existingProduct) {
          const result = await increaseInventoryForNewExpense([newProduct], transactionId, 'manual')
          results.push(...result)
          continue
        }

        const quantityDifference = newProduct.quantity - existingProduct.quantity
        if (quantityDifference === 0) {
          results.push({
            productId: newProductId,
            productName: newProduct.name,
            oldStock: 0,
            newStock: 0,
            quantityChange: 0,
            success: true
          })
          continue
        }

        const productId = typeof newProduct.productId === 'string'
          ? new mongoose.Types.ObjectId(newProduct.productId)
          : newProduct.productId

        const productDoc = await mongoose.connection.db!.collection('products').findOne({
          _id: productId,
          supplier: 'Viva Raw'
        })

        if (!productDoc) {
          results.push({
            productId: newProductId,
            productName: newProduct.name,
            oldStock: 0,
            newStock: 0,
            quantityChange: quantityDifference,
            success: false,
            error: 'Product not found or not a Viva Raw product'
          })
          continue
        }

        const oldStock = productDoc.stock || 0
        const newStock = Math.max(0, oldStock + quantityDifference)

        await mongoose.connection.db!.collection('products').updateOne(
          { _id: productId },
          { $set: { stock: newStock, updatedAt: new Date() } }
        )

        results.push({
          productId: newProductId,
          productName: newProduct.name,
          oldStock,
          newStock,
          quantityChange: quantityDifference,
          success: true
        })

        console.log(`[Inventory] (Expense Update) Adjusted Viva Raw product ${newProduct.name}: ${oldStock} → ${newStock} (${quantityDifference >= 0 ? '+' : ''}${quantityDifference})`)
      } catch (error) {
        results.push({
          productId: (typeof newProduct.productId === 'string' ? newProduct.productId : newProduct.productId.toString()),
          productName: newProduct.name,
          oldStock: 0,
          newStock: 0,
          quantityChange: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        console.error(`[Inventory] (Expense Update) Error adjusting inventory for product ${newProduct.name}:`, error)
      }
    }

  } catch (error) {
    console.error('[Inventory] Error in increaseInventoryForExistingExpense:', error)
    throw error
  }

  return results
}

/**
 * Restores inventory for Viva Raw products when a transaction is deleted
 * @param transactionId The ID of the transaction being deleted
 * @returns Array of inventory update results
 */
export async function restoreInventoryForDeletedTransaction(
  transactionId: string
): Promise<InventoryUpdateResult[]> {
  const results: InventoryUpdateResult[] = []

  try {
    // Get the transaction before it's deleted to extract product information
    const transaction = await mongoose.connection.db!.collection('transactions').findOne({
      _id: new mongoose.Types.ObjectId(transactionId)
    })

    if (!transaction) {
      console.warn(`[Inventory] Transaction ${transactionId} not found for inventory restoration`)
      return results
    }

    const products = transaction.products || []
    
    // Only process sale transactions with products
    if (transaction.type !== 'sale' || products.length === 0) {
      console.log(`[Inventory] Transaction ${transactionId} is not a sale transaction or has no products, skipping inventory restoration`)
      return results
    }

    console.log(`[Inventory] Restoring inventory for deleted transaction ${transactionId} with ${products.length} products`)

    for (const product of products) {
      try {
        // Convert productId to ObjectId if it's a string
        const productId = typeof product.productId === 'string' 
          ? new mongoose.Types.ObjectId(product.productId)
          : product.productId

        // Find the product in the database
        const productDoc = await mongoose.connection.db!.collection('products').findOne({
          _id: productId,
          supplier: 'Viva Raw'
        })

        if (!productDoc) {
          results.push({
            productId: productId.toString(),
            productName: product.name || 'Unknown',
            oldStock: 0,
            newStock: 0,
            quantityChange: product.quantity,
            success: false,
            error: 'Product not found or not a Viva Raw product'
          })
          continue
        }

        const oldStock = productDoc.stock || 0
        const newStock = oldStock + product.quantity // Add back the quantity that was sold

        // Update the product's stock
        await mongoose.connection.db!.collection('products').updateOne(
          { _id: productId },
          { $set: { stock: newStock, updatedAt: new Date() } }
        )

        results.push({
          productId: productId.toString(),
          productName: product.name || 'Unknown',
          oldStock,
          newStock,
          quantityChange: product.quantity, // Positive because we're adding back to stock
          success: true
        })

        console.log(`[Inventory] Restored Viva Raw product ${product.name}: ${oldStock} → ${newStock} (+${product.quantity})`)
      } catch (error) {
        results.push({
          productId: (typeof product.productId === 'string' ? product.productId : product.productId.toString()),
          productName: product.name || 'Unknown',
          oldStock: 0,
          newStock: 0,
          quantityChange: product.quantity,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        console.error(`[Inventory] Error restoring inventory for product ${product.name}:`, error)
      }
    }

  } catch (error) {
    console.error('[Inventory] Error in restoreInventoryForDeletedTransaction:', error)
    throw error
  }

  return results
} 