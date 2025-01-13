import type { WithId } from 'mongodb'
import type { Transaction } from '@/types'
import dotenv from 'dotenv'
import { resolve } from 'path'
import { getDb } from '@/lib/db'

// Load environment variables from .env.local
const envPath = resolve(process.cwd(), '.env.local')
dotenv.config({ path: envPath })

type CustomerSource = {
  source: 'square' | 'shopify' | 'manual'
  sourceId?: string // Square/Shopify customer ID if available
  name?: string // Full name if available
}

interface Customer {
  name: string
  sources: CustomerSource[]
  firstPurchaseDate: string
  lastPurchaseDate: string
  totalSpent: number
  totalOrders: number
  averageOrderValue: number
  createdAt: string
  updatedAt: string
}

interface CustomerData {
  transactions: WithId<Transaction>[]
  sources: Set<string>
  sourceIds: Map<string, string>
}

async function createCustomers() {
  try {
    console.log('Connecting to MongoDB...')
    const db = await getDb()
    
    // Get all transactions with customer information
    const transactions = (await db.collection('transactions')
      .find({ 
        customer: { $exists: true, $ne: '' },
        type: 'sale',
        status: { $ne: 'void' }
      })
      .sort({ date: 1 })
      .toArray()) as unknown as WithId<Transaction>[]

    console.log(`Found ${transactions.length} transactions with customer information`)

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
    const customerMap = new Map<string, CustomerData>()

    transactions.forEach(transaction => {
      const customerKey = transaction.source === 'square' 
        ? `square_${transaction.customer}`
        : transaction.customer!.toLowerCase()

      if (!customerMap.has(customerKey)) {
        customerMap.set(customerKey, {
          transactions: [],
          sources: new Set(),
          sourceIds: new Map()
        })
      }

      const customerData = customerMap.get(customerKey)!
      customerData.transactions.push(transaction)
      customerData.sources.add(transaction.source)
      
      if (transaction.source === 'square' && transaction.customer) {
        customerData.sourceIds.set('square', transaction.customer)
      }
    })

    console.log(`Found ${customerMap.size} unique customers`)

    // Log customer names before creating documents
    console.log('\nCustomer name samples:')
    let i = 0
    for (const [customerKey, data] of Array.from(customerMap.entries())) {
      if (i++ < 5) {  // Show first 5 examples
        console.log(`- Source: ${Array.from(data.sources)[0]}, Key: ${customerKey}, First transaction customer name: ${data.transactions[0].customer}`)
      }
    }

    // Create customer documents
    const customers: Customer[] = []
    for (const [customerKey, data] of Array.from(customerMap.entries())) {
      const transactions = data.transactions
      const sources: CustomerSource[] = Array.from(data.sources).map(source => ({
        source: source as 'square' | 'shopify' | 'manual',
        sourceId: data.sourceIds.get(source),
        name: source === 'square' && data.sourceIds.get('square')
          ? customerKey.replace('square_', '')
          : transactions[0].customer?.trim() || undefined
      }))

      const totalSpent = transactions.reduce((sum, t) => sum + (t.amount || 0), 0)
      
      // Try to get the best possible name
      let customerName = 'Unknown'
      
      // First try to get a name from sources
      const sourceWithName = sources.find(s => s.name && s.name.trim() !== '')
      if (sourceWithName?.name) {
        customerName = sourceWithName.name
      } else {
        // If no source has a name, try to find a valid name from transactions
        const transactionWithName = transactions.find(t => t.customer && t.customer.trim() !== '')
        if (transactionWithName?.customer) {
          customerName = transactionWithName.customer.trim()
        }
      }
      
      const customer: Customer = {
        name: customerName,
        sources,
        firstPurchaseDate: transactions[0].date,
        lastPurchaseDate: transactions[transactions.length - 1].date,
        totalSpent,
        totalOrders: transactions.length,
        averageOrderValue: totalSpent / transactions.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      // Log if we couldn't find a proper name
      if (customerName === 'Unknown') {
        console.log('Customer with no valid name found:', {
          customerKey,
          sources: Array.from(data.sources),
          transactionCount: transactions.length,
          firstTransactionDate: transactions[0].date
        })
      }

      customers.push(customer)
    }

    // Create customers collection and insert documents
    console.log('Creating customers collection...')
    await db.createCollection('customers')
    
    console.log('Inserting customer documents...')
    const result = await db.collection('customers').insertMany(customers)
    
    console.log(`Successfully created ${result.insertedCount} customer documents`)
    
    process.exit(0)
  } catch (error) {
    console.error('Error creating customers:', error)
    process.exit(1)
  }
}

createCustomers() 