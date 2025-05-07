# Scripts

This directory contains various utility scripts for the Daydreamers Backend application.

## AMEX Email Download Script

The `download-amex-emails.ts` script downloads AMEX purchase notification emails from Gmail and saves them as HTML files in the `data/amex-emails` directory. This script uses the same method as the API route `app/api/amex/route.ts` to ensure compatibility.

### Usage

```bash
# Download AMEX emails from the last 30 days (default)
npm run download-amex

# Download AMEX emails from the last N days
npm run download-amex -- --since=60
```

### How It Works

1. The script connects to the MongoDB database to retrieve Gmail credentials
2. It initializes the Gmail service with these credentials
3. It searches for emails from American Express with the subject "Large Purchase Approved"
4. For each matching email, it:
   - Parses the email content
   - Extracts relevant information (date, amount, merchant, etc.)
   - Saves the email body as an HTML file in the `data/amex-emails` directory
   - The filename format is `YYYY-MM-DD_emailId.html`

### Requirements

- Gmail credentials must be stored in the database (type: 'gmail')
- The `data/amex-emails` directory must exist (it will be created if it doesn't)

### Notes

- The script uses the same parsing logic as the API route to ensure compatibility
- By default, it searches for emails from the last 30 days
- You can specify a different time range using the `--since=N` parameter 