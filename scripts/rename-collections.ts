import { connectToDatabase } from './db-connect.js';

async function renameCollections() {
  try {
    const { db } = await connectToDatabase();
    console.log('Connected to database');

    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('\nCurrent collections:');
    collections.forEach(collection => {
      console.log(`- ${collection.name}`);
    });

    // Rename collections in the correct order
    console.log('\nRenaming collections...');

    // 1. Rename current 'products' to 'products_legacy' if it exists
    if (collections.some(c => c.name === 'products')) {
      await db.collection('products').rename('products_legacy');
      console.log('Renamed "products" to "products_legacy"');
    }

    // 2. Rename 'products_new_schema' to 'products'
    if (collections.some(c => c.name === 'products_new_schema')) {
      await db.collection('products_new_schema').rename('products');
      console.log('Renamed "products_new_schema" to "products"');
    }

    // List collections after renaming
    const updatedCollections = await db.listCollections().toArray();
    console.log('\nCollections after renaming:');
    updatedCollections.forEach(collection => {
      console.log(`- ${collection.name}`);
    });

    console.log('\nCollection renaming completed successfully');

  } catch (error) {
    console.error('Failed to rename collections:', error);
    process.exit(1);
  }
}

// Run the renaming
renameCollections()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  }); 