import fs from 'fs'
import path from 'path'
import os from 'os'

export async function getGoogleCredentialsPath() {
  // If GOOGLE_APPLICATION_CREDENTIALS is set, use that
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS
  }

  // If we're in Vercel (or any environment with the JSON directly provided)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    try {
      // Create a temporary directory
      const tempDir = path.join(os.tmpdir(), 'google-credentials')
      const tempFile = path.join(tempDir, 'service-account.json')

      // Ensure the directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }

      // Write the credentials to a temporary file
      fs.writeFileSync(tempFile, process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)

      // Return the path to the temporary file
      return tempFile
    } catch (error) {
      console.error('Error creating temporary credentials file:', error)
      throw error
    }
  }

  throw new Error('No Google credentials found')
} 