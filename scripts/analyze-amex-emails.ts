import { GmailService } from '@/lib/gmail'
import { connectToDatabase } from '@/lib/mongoose'
import mongoose from 'mongoose'
import fs from 'fs/promises'
import path from 'path'
import { JSDOM } from 'jsdom'

interface EmailAnalysis {
  emailId: string
  date: string
  currentMerchantMatch: string | null
  htmlStructure: string
  potentialMerchantMatches: {
    pattern: string
    match: string
  }[]
}

async function analyzeAmexEmails() {
  try {
    console.log('Connecting to database...')
    await connectToDatabase()

    // Get Gmail credentials
    const credentials = await mongoose.model('Credential').findOne({ type: 'gmail' })
    if (!credentials?.data) {
      throw new Error('Gmail not authenticated')
    }

    // Initialize Gmail service
    const gmailService = new GmailService()
    gmailService.setCredentials(credentials.data)
    const gmail = google.gmail({ version: 'v1', auth: gmailService.getAuth() })

    // Search for Amex emails from the last 90 days
    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - 90)
    const afterTimestamp = Math.floor(sinceDate.getTime() / 1000)
    
    const query = `from:AmericanExpress@welcome.americanexpress.com subject:"Large Purchase Approved" after:${afterTimestamp}`
    console.log('Searching for Amex emails with query:', query)
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50
    })

    if (!response.data.messages || response.data.messages.length === 0) {
      console.log('No matching Amex emails found')
      return
    }

    console.log(`Found ${response.data.messages.length} matching Amex emails`)
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), 'data', 'amex-emails')
    await fs.mkdir(outputDir, { recursive: true })

    const analyses: EmailAnalysis[] = []
    
    // Process each email
    for (const message of response.data.messages) {
      if (!message.id) continue
      
      console.log(`\nProcessing email ${message.id}...`)
      
      const email = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full'
      })

      const body = email.data.payload?.parts?.[0]?.body?.data || email.data.payload?.body?.data
      if (!body) {
        console.log(`No body found for email ${message.id}`)
        continue
      }

      const decodedBody = Buffer.from(body, 'base64').toString('utf-8')
      
      // Save raw email body to file
      const emailFile = path.join(outputDir, `${message.id}.html`)
      await fs.writeFile(emailFile, decodedBody)
      
      // Current merchant extraction method
      const currentMerchantMatch = decodedBody.match(/was made at ([^\.]+)/i)
      const currentMerchant = currentMerchantMatch ? currentMerchantMatch[1].trim() : null
      
      // Parse HTML to analyze structure
      const dom = new JSDOM(decodedBody)
      const document = dom.window.document
      
      // Look for potential merchant patterns
      const potentialMatches = []
      
      // Pattern 1: Look for text in blue (#006fcf) - common in Amex emails
      const blueElements = document.querySelectorAll('[style*="color:#006fcf"]')
      blueElements.forEach(el => {
        if (el.textContent?.trim()) {
          potentialMatches.push({
            pattern: 'Blue text (#006fcf)',
            match: el.textContent.trim()
          })
        }
      })
      
      // Pattern 2: Look for text near currency amounts
      const currencyRegex = /\$[\d,]+\.\d{2}/
      const textNodes = document.evaluate(
        '//text()[contains(., "$")]',
        document,
        null,
        dom.window.XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
        null
      )
      
      for (let i = 0; i < textNodes.snapshotLength; i++) {
        const node = textNodes.snapshotItem(i)
        if (node && currencyRegex.test(node.textContent || '')) {
          const parentText = node.parentElement?.textContent?.trim()
          if (parentText) {
            potentialMatches.push({
              pattern: 'Near currency amount',
              match: parentText
            })
          }
        }
      }
      
      // Pattern 3: Look for text in larger font sizes
      const largeTextElements = document.querySelectorAll('[style*="font-size"]')
      largeTextElements.forEach(el => {
        const style = el.getAttribute('style') || ''
        const fontSizeMatch = style.match(/font-size:\s*(\d+)px/)
        if (fontSizeMatch && parseInt(fontSizeMatch[1]) > 14 && el.textContent?.trim()) {
          potentialMatches.push({
            pattern: `Large text (${fontSizeMatch[1]}px)`,
            match: el.textContent.trim()
          })
        }
      })
      
      // Get a simplified HTML structure
      const structure = document.body ? simplifyHtmlStructure(document.body) : 'No body element found'
      
      analyses.push({
        emailId: message.id,
        date: new Date(parseInt(email.data.internalDate || '0')).toISOString(),
        currentMerchantMatch: currentMerchant,
        htmlStructure: structure,
        potentialMerchantMatches: potentialMatches
      })
    }
    
    // Save analysis results
    const analysisFile = path.join(outputDir, 'analysis.json')
    await fs.writeFile(
      analysisFile,
      JSON.stringify(analyses, null, 2)
    )
    
    // Generate summary report
    const reportFile = path.join(outputDir, 'report.md')
    const report = generateReport(analyses)
    await fs.writeFile(reportFile, report)
    
    console.log('\nAnalysis complete!')
    console.log(`Raw email bodies saved to: ${outputDir}`)
    console.log(`Analysis results saved to: ${analysisFile}`)
    console.log(`Summary report saved to: ${reportFile}`)
    
  } catch (error) {
    console.error('Error analyzing emails:', error)
  } finally {
    // Close database connection
    await mongoose.connection.close()
  }
}

function simplifyHtmlStructure(element: Element, depth = 0): string {
  const indent = '  '.repeat(depth)
  let structure = `${indent}<${element.tagName.toLowerCase()}`
  
  // Add important attributes
  const attrs = ['id', 'class', 'style']
  attrs.forEach(attr => {
    const value = element.getAttribute(attr)
    if (value) {
      structure += ` ${attr}="${value}"`
    }
  })
  
  structure += '>\n'
  
  // Add text content if it's not just whitespace
  const text = element.textContent?.trim()
  if (text && element.children.length === 0) {
    structure += `${indent}  "${text}"\n`
  }
  
  // Recursively process child elements
  Array.from(element.children).forEach(child => {
    structure += simplifyHtmlStructure(child, depth + 1)
  })
  
  structure += `${indent}</${element.tagName.toLowerCase()}>\n`
  return structure
}

function generateReport(analyses: EmailAnalysis[]): string {
  let report = '# Amex Email Analysis Report\n\n'
  
  // Summary statistics
  report += '## Summary\n\n'
  report += `- Total emails analyzed: ${analyses.length}\n`
  report += `- Emails with current merchant match: ${analyses.filter(a => a.currentMerchantMatch).length}\n\n`
  
  // Pattern frequency analysis
  const patterns = new Map<string, number>()
  analyses.forEach(analysis => {
    analysis.potentialMerchantMatches.forEach(match => {
      patterns.set(match.pattern, (patterns.get(match.pattern) || 0) + 1)
    })
  })
  
  report += '## Pattern Frequencies\n\n'
  Array.from(patterns.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([pattern, count]) => {
      report += `- ${pattern}: ${count} occurrences\n`
    })
  
  // Sample matches
  report += '\n## Sample Matches\n\n'
  analyses.slice(0, 5).forEach(analysis => {
    report += `### Email ${analysis.emailId}\n`
    report += `Date: ${analysis.date}\n`
    report += `Current merchant match: ${analysis.currentMerchantMatch || 'None'}\n\n`
    report += 'Potential matches:\n'
    analysis.potentialMerchantMatches.forEach(match => {
      report += `- ${match.pattern}: "${match.match}"\n`
    })
    report += '\n'
  })
  
  return report
}

// Run the analysis
analyzeAmexEmails() 