const { getDb } = require('../lib/db.js');
const { ObjectId } = require('mongodb');

/**
 * Script to update all transactions for Monica Vergara:
 * - Sets taxAmount to 0
 * - Sets isTaxable to false
 * - Sets preTaxAmount equal to amount (since there's no tax)
 */
async function updateMonicaTransactions() {
  console.log('🔄 Starting update of Monica Vergara transactions...');
  
  try {
    // Connect to database
    const db = await getDb();
    const transactionsCollection = db.collection('transactions');
    
    // First, find all matching transactions to see what we're working with
    const matchingTransactions = await transactionsCollection.find({
      $or: [
        { customer: "Monica Vergara" },
        { clientName: "Monica Vergara" }
      ]
    }).toArray();
    
    console.log(`📊 Found ${matchingTransactions.length} transactions for Monica Vergara`);
    
    // Show summary of what we found
    console.log('\nTransaction Summary:');
    matchingTransactions.forEach(tx => {
      const id = tx.id || tx._id;
      const date = new Date(tx.date).toLocaleDateString();
      const amount = tx.amount ? `$${tx.amount.toFixed(2)}` : 'N/A';
      const taxAmount = tx.taxAmount !== undefined ? `$${tx.taxAmount.toFixed(2)}` : 'N/A';
      const preTaxAmount = tx.preTaxAmount !== undefined ? `$${tx.preTaxAmount.toFixed(2)}` : 'N/A';
      const type = tx.type || 'unknown';
      
      console.log(`- ID: ${id}, Date: ${date}, Type: ${type}, Amount: ${amount}, Pre-tax: ${preTaxAmount}, Tax: ${taxAmount}`);
    });
    
    // Update each transaction individually to correctly set preTaxAmount based on amount
    let updatedCount = 0;
    let errors = 0;
    
    for (const tx of matchingTransactions) {
      try {
        // For each transaction, we'll update multiple fields
        const updateDoc = {
          taxAmount: 0,
          isTaxable: false
        };
        
        // If amount exists, set preTaxAmount equal to amount
        if (tx.amount !== undefined) {
          updateDoc['preTaxAmount'] = tx.amount;
        }
        
        // Update this specific transaction
        const updateResult = await transactionsCollection.updateOne(
          { _id: tx._id },
          { $set: updateDoc }
        );
        
        if (updateResult.modifiedCount > 0) {
          updatedCount++;
        }
      } catch (error) {
        console.error(`Error updating transaction ${tx._id || tx.id}:`, error);
        errors++;
      }
    }
    
    console.log('\n✅ Update complete!');
    console.log(`📝 Successfully updated ${updatedCount} transactions`);
    if (errors > 0) {
      console.log(`⚠️ Encountered errors with ${errors} transactions`);
    }
    
    // Calculate amount of tax removed
    let totalTaxRemoved = 0;
    matchingTransactions.forEach(tx => {
      if (tx.taxAmount) {
        totalTaxRemoved += tx.taxAmount;
      }
    });
    
    console.log(`💰 Total tax amount removed: $${totalTaxRemoved.toFixed(2)}`);
    
    // Print before/after example for verification
    if (matchingTransactions.length > 0) {
      const sampleTx = matchingTransactions[0];
      console.log('\n📋 Sample Transaction Update:');
      console.log('BEFORE:');
      console.log(`  Amount: $${sampleTx.amount?.toFixed(2) || 'N/A'}`);
      console.log(`  Pre-tax Amount: $${sampleTx.preTaxAmount?.toFixed(2) || 'N/A'}`);
      console.log(`  Tax Amount: $${sampleTx.taxAmount?.toFixed(2) || 'N/A'}`);
      console.log(`  isTaxable: ${sampleTx.isTaxable || 'undefined'}`);
      
      console.log('AFTER:');
      console.log(`  Amount: $${sampleTx.amount?.toFixed(2) || 'N/A'}`);
      console.log(`  Pre-tax Amount: $${sampleTx.amount?.toFixed(2) || 'N/A'}`);
      console.log(`  Tax Amount: $0.00`);
      console.log(`  isTaxable: false`);
    }
    
  } catch (error) {
    console.error('❌ Error updating transactions:', error);
  } finally {
    console.log('\n🏁 Script execution completed');
    process.exit(0);
  }
}

// Run the script
updateMonicaTransactions(); 