import mongoose, { connect, disconnect } from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
config({ path: join(__dirname, '../.env.local') });

interface TransactionAnalysis {
  totalDocuments: number;
  uniqueFields: Set<string>;
  fieldTypes: Record<string, Set<string>>;
  sampleDocuments: any[];
  inconsistencies: {
    missingRequiredFields: string[];
    inconsistentTypes: Record<string, string[]>;
  };
}

async function analyzeTransactions(): Promise<TransactionAnalysis> {
  const analysis: TransactionAnalysis = {
    totalDocuments: 0,
    uniqueFields: new Set(),
    fieldTypes: {},
    sampleDocuments: [],
    inconsistencies: {
      missingRequiredFields: [],
      inconsistentTypes: {},
    },
  };

  try {
    // Connect to the database
    await connect(process.env.MONGODB_URI as string);
    console.log('Connected to database');

    // Get all transactions
    if (!mongoose.connection.db) {
      throw new Error('Database connection not established');
    }
    const transactions = await mongoose.connection.db.collection('transactions').find({}).toArray();
    analysis.totalDocuments = transactions.length;
    console.log(`Analyzing ${analysis.totalDocuments} transaction documents...`);

    // Analyze each document
    for (const doc of transactions) {
      // Track all fields
      Object.keys(doc).forEach(field => {
        analysis.uniqueFields.add(field);
        
        // Track field types
        if (!analysis.fieldTypes[field]) {
          analysis.fieldTypes[field] = new Set();
        }
        analysis.fieldTypes[field].add(typeof doc[field]);
      });

      // Store a few sample documents
      if (analysis.sampleDocuments.length < 5) {
        analysis.sampleDocuments.push(doc);
      }
    }

    // Analyze inconsistencies
    for (const field of analysis.uniqueFields) {
      const types = Array.from(analysis.fieldTypes[field]);
      if (types.length > 1) {
        analysis.inconsistencies.inconsistentTypes[field] = types;
      }
    }

    // Log results
    console.log('\nAnalysis Results:');
    console.log('-----------------');
    console.log(`Total Documents: ${analysis.totalDocuments}`);
    console.log('\nUnique Fields:');
    Array.from(analysis.uniqueFields).forEach(field => {
      console.log(`- ${field}: ${Array.from(analysis.fieldTypes[field]).join(', ')}`);
    });

    console.log('\nSample Documents:');
    analysis.sampleDocuments.forEach((doc, index) => {
      console.log(`\nDocument ${index + 1}:`);
      console.log(JSON.stringify(doc, null, 2));
    });

    if (Object.keys(analysis.inconsistencies.inconsistentTypes).length > 0) {
      console.log('\nInconsistent Types Found:');
      Object.entries(analysis.inconsistencies.inconsistentTypes).forEach(([field, types]) => {
        console.log(`- ${field}: ${types.join(', ')}`);
      });
    }

    // Disconnect from database
    await disconnect();
    console.log('\nDisconnected from database');
    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    await disconnect();
    process.exit(1);
  }
}

// Run the analysis
analyzeTransactions(); 