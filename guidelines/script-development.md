# Script Development Guidelines

This document outlines best practices and guidelines for developing scripts in our project, based on our experience with database migration scripts and other utilities.

## Directory Structure

- All scripts should be placed in the `/scripts` directory
- Use descriptive names that indicate the script's purpose (e.g., `migrate-names.ts`, `cleanup-data.ts`)

## Script Development Best Practices

### 1. Script Setup

```typescript
// Import dependencies at the top
import { connect, disconnect } from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
config({ path: join(__dirname, '../.env.local') });

// Define the main function
async function main() {
  try {
    // Connect to the database
    await connect(process.env.MONGODB_URI as string);
    console.log('Connected to database');

    // Script logic goes here
    
    // Always disconnect when done
    await disconnect();
    console.log('Disconnected from database');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main();
```

### 2. Model Imports

- Always import models from their original location instead of redefining schemas
- Example:
```typescript
import StudentModel from '@/lib/models/Student';
```

### 3. Error Handling

- Wrap database operations in try-catch blocks
- Log detailed error messages
- Use appropriate exit codes (0 for success, 1 for errors)
- Consider adding a dry-run option for testing

### 4. Progress Tracking

- Log progress for long-running operations
- Consider using a progress bar for better visibility
- Example:
```typescript
let processed = 0;
const total = await StudentModel.countDocuments();
console.log(`Processing ${total} documents...`);

// Process in batches
const cursor = StudentModel.find().cursor();
for await (const doc of cursor) {
  // Process document
  processed++;
  if (processed % 100 === 0) {
    console.log(`Processed ${processed}/${total} documents`);
  }
}
```

### 5. Data Validation

- Always validate data before making changes
- Log invalid data for manual review
- Consider adding a validation-only mode

### 6. Running Scripts

To run a TypeScript script:
```bash
npx ts-node --esm scripts/your-script.ts
```

For JavaScript scripts:
```bash
node scripts/your-script.js
```

### 7. Common Patterns

#### Database Updates
```typescript
// Batch processing
const batchSize = 100;
const totalDocuments = await Model.countDocuments(query);
const batches = Math.ceil(totalDocuments / batchSize);

for (let i = 0; i < batches; i++) {
  const documents = await Model.find(query)
    .skip(i * batchSize)
    .limit(batchSize);
    
  for (const doc of documents) {
    // Process document
  }
  
  console.log(`Processed batch ${i + 1}/${batches}`);
}
```

#### Data Migration
```typescript
// Migration with backup
const backup = [];
const cursor = Model.find().cursor();

for await (const doc of cursor) {
  backup.push(doc.toObject());
  
  // Perform migration
  doc.newField = transformData(doc.oldField);
  await doc.save();
}

// Store backup if needed
await BackupModel.insertMany(backup);
```

## Testing Scripts

1. Always test scripts on a development database first
2. Create a small test dataset
3. Run in dry-run mode if available
4. Verify results manually
5. Keep backup of data before running on production

## Troubleshooting Common Issues

1. Module Resolution
   - Use `ts-node --esm` for ES modules
   - Ensure `tsconfig.json` has correct module settings
   - Use proper import paths (consider path aliases)

2. Database Connection
   - Verify environment variables are loaded
   - Check connection string format
   - Ensure proper authentication

3. Memory Management
   - Use cursors for large datasets
   - Process in batches
   - Monitor memory usage

## Best Practices Checklist

- [ ] Script has clear purpose and documentation
- [ ] Environment variables are properly loaded
- [ ] Models are imported from source
- [ ] Error handling is implemented
- [ ] Progress tracking is included
- [ ] Database connections are properly managed
- [ ] Backup strategy is considered
- [ ] Script has been tested on development data
- [ ] Memory usage is optimized for large datasets
- [ ] Exit codes are properly set 