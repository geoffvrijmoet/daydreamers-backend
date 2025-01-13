// This script uses CommonJS require syntax as it runs directly with Node
// and is not part of the Next.js application bundle
const { getDb } = require('../lib/db.js')

async function mergeDuplicateCustomers(db) {
  console.log('\nChecking for duplicate customer names...')
  
  // Find all customers and group by normalized name
  const customers = await db.collection('customers').find({}).toArray()
  const nameGroups = new Map()

  customers.forEach(customer => {
    const normalizedName = customer.name.toLowerCase().trim()
    if (!nameGroups.has(normalizedName)) {
      nameGroups.set(normalizedName, [])
    }
    nameGroups.get(normalizedName).push(customer)
  })

  // Find groups with more than one customer
  let mergeCount = 0
  for (const [name, group] of nameGroups) {
    if (group.length > 1) {
      console.log(`\nFound ${group.length} customers with name "${name}":`)
      
      // Merge all customers in the group into one
      const mergedCustomer = {
        name: group[0].name, // Keep the name from the first customer
        sources: new Set(),
        sourceIds: {},
        firstPurchaseDate: group[0].firstPurchaseDate,
        lastPurchaseDate: group[0].lastPurchaseDate,
        totalSpent: 0,
        numberOfOrders: 0,
        createdAt: group[0].createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      // Combine data from all duplicates
      group.forEach(customer => {
        // Merge sources
        customer.sources?.forEach(source => mergedCustomer.sources.add(source))
        
        // Merge sourceIds
        if (customer.sourceIds) {
          Object.assign(mergedCustomer.sourceIds, customer.sourceIds)
        }

        // Update dates
        if (customer.firstPurchaseDate < mergedCustomer.firstPurchaseDate) {
          mergedCustomer.firstPurchaseDate = customer.firstPurchaseDate
        }
        if (customer.lastPurchaseDate > mergedCustomer.lastPurchaseDate) {
          mergedCustomer.lastPurchaseDate = customer.lastPurchaseDate
        }

        // Update totals
        mergedCustomer.totalSpent += (customer.totalSpent || 0)
        mergedCustomer.numberOfOrders += (customer.numberOfOrders || 0)

        console.log(`  - ID: ${customer._id}, Sources: ${customer.sources?.join(', ')}, Orders: ${customer.numberOfOrders}`)
      })

      // Convert Set to Array for sources
      mergedCustomer.sources = Array.from(mergedCustomer.sources)
      
      // Calculate new average order value
      mergedCustomer.averageOrderValue = mergedCustomer.totalSpent / mergedCustomer.numberOfOrders

      // Delete all duplicates
      await db.collection('customers').deleteMany({
        _id: { $in: group.slice(1).map(c => c._id) }
      })

      // Update the first customer with merged data
      await db.collection('customers').updateOne(
        { _id: group[0]._id },
        { $set: mergedCustomer }
      )

      mergeCount++
    }
  }

  if (mergeCount > 0) {
    console.log(`\nMerged ${mergeCount} groups of duplicate customers`)
  } else {
    console.log('No duplicate customers found')
  }
}

async function createCustomers() {
  try {
    console.log('Connecting to MongoDB...')
    const db = await getDb()
    
    // First, merge any existing duplicate customers
    await mergeDuplicateCustomers(db)
    
    // Get all transactions with customer information
    const transactions = await db.collection('transactions')
      .find({ 
        customer: { $exists: true, $ne: '' },
        type: 'sale',
        status: { $ne: 'void' }
      })
      .sort({ date: 1 })
      .toArray()

    console.log(`\nFound ${transactions.length} transactions with customer information`)

    // Log any transactions with unusual customer data
    transactions.forEach(transaction => {
      if (!transaction.customer || transaction.customer.trim() === '') {
        console.log('Transaction with empty customer name:', {
          id: transaction._id,
          date: transaction.date,
          source: transaction.source,
          amount: transaction.amount
        })
      }
    })

    // Group transactions by customer
    const customerMap = new Map()

    transactions.forEach(transaction => {
      // Skip transactions with invalid customer data
      if (!transaction.customer || typeof transaction.customer !== 'string') {
        return
      }

      // Create a unique key based on source and customer ID
      const customerKey = `${transaction.source}_${transaction.customer.trim()}`

      if (!customerMap.has(customerKey)) {
        customerMap.set(customerKey, {
          transactions: [],
          sources: new Set(),
          sourceIds: new Map()
        })
      }

      const customerData = customerMap.get(customerKey)
      customerData.transactions.push(transaction)
      customerData.sources.add(transaction.source)
      
      // Store the original customer ID for each source
      if (transaction.customer) {
        switch (transaction.source) {
          case 'square':
            customerData.sourceIds.set('squareCustomerId', transaction.customer)
            break
          case 'shopify':
            customerData.sourceIds.set('shopifyCustomerId', transaction.customer)
            break
          case 'manual':
            customerData.sourceIds.set('manualCustomerId', transaction.customer)
            break
          default:
            customerData.sourceIds.set(`${transaction.source}CustomerId`, transaction.customer)
        }
      }
    })

    console.log(`Found ${customerMap.size} unique customers`)

    // Log customer names before creating documents
    console.log('\nCustomer name samples:')
    let i = 0
    for (const [customerKey, data] of customerMap.entries()) {
      if (i++ < 5) {  // Show first 5 examples
        const sourceIds = Object.fromEntries(data.sourceIds)
        console.log(`- Source: ${Array.from(data.sources)[0]}, Key: ${customerKey}`)
        console.log('  Source IDs:', sourceIds)
        console.log('  First transaction customer name:', data.transactions[0].customer)
      }
    }

    // Prepare bulk write operations
    const bulkOps = []
    for (const [, data] of customerMap.entries()) {
      const transactions = data.transactions
      const firstTransaction = transactions[0]
      const sourceIds = Object.fromEntries(data.sourceIds)
      
      // Get the best available name
      const name = firstTransaction.customer || 'Unknown'

      // Create a filter that matches ANY of the source IDs
      const filter = {
        $or: Object.entries(sourceIds).map(([key, value]) => ({
          [`sourceIds.${key}`]: value
        }))
      }

      bulkOps.push({
        updateOne: {
          filter,
          update: {
            $set: {
              name,
              sources: Array.from(data.sources),
              sourceIds,
              firstPurchaseDate: transactions[0].date,
              lastPurchaseDate: transactions[transactions.length - 1].date,
              totalSpent: transactions.reduce((sum, t) => sum + t.amount, 0),
              numberOfOrders: transactions.length,
              averageOrderValue: transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length,
              updatedAt: new Date().toISOString()
            },
            $setOnInsert: {
              createdAt: new Date().toISOString()
            }
          },
          upsert: true
        }
      })
    }

    // Log any customers with "Unknown" name
    const unknownCustomers = bulkOps.filter(op => op.updateOne.update.$set.name === 'Unknown')
    if (unknownCustomers.length > 0) {
      console.log(`\nFound ${unknownCustomers.length} customers with "Unknown" name`)
    }

    // Execute bulk write operations
    if (bulkOps.length > 0) {
      const result = await db.collection('customers').bulkWrite(bulkOps)
      console.log('\nCustomer update results:')
      console.log(`- Matched: ${result.matchedCount}`)
      console.log(`- Modified: ${result.modifiedCount}`)
      console.log(`- Inserted: ${result.upsertedCount}`)
    }

  } catch (error) {
    console.error('Error creating customers:', error)
  }
}

createCustomers() 