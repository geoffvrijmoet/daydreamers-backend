import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EMAIL_DIR = path.join(__dirname, '../data/amex-emails');

async function parseEmail(filePath) {
  const html = await fs.promises.readFile(filePath, 'utf8');
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  const transactions = [];
  
  // Look for merchant name and amount patterns
  const text = document.body.textContent;
  
  // Find all instances of merchant names followed by amounts
  const merchantPattern = /([A-Z][A-Z\s]+)\$(\d+\.\d+)\*([A-Za-z]+,\s+[A-Za-z]+\s+\d+,\s+\d+)\*/g;
  let match;
  
  while ((match = merchantPattern.exec(text)) !== null) {
    const [_, merchant, amount, date] = match;
    if (merchant && amount && date) {
      transactions.push({
        merchant: merchant.trim(),
        amount: parseFloat(amount),
        date: new Date(date).toISOString().split('T')[0]
      });
    }
  }
  
  return transactions;
}

async function processEmails() {
  const files = await fs.promises.readdir(EMAIL_DIR);
  const htmlFiles = files.filter(f => f.endsWith('.html'));
  
  console.log(`Processing ${htmlFiles.length} email files...`);
  
  const allTransactions = [];
  
  for (const file of htmlFiles) {
    const filePath = path.join(EMAIL_DIR, file);
    const transactions = await parseEmail(filePath);
    allTransactions.push(...transactions);
  }
  
  allTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const outputPath = path.join(EMAIL_DIR, 'parsed-transactions.json');
  await fs.promises.writeFile(outputPath, JSON.stringify(allTransactions, null, 2));
  
  console.log(`Found ${allTransactions.length} transactions`);
  console.log(`Results saved to ${outputPath}`);
}

processEmails().catch(console.error); 