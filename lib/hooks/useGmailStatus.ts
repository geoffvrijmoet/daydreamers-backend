import { useState, useEffect } from 'react'

export function useGmailStatus() {
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function checkStatus() {
    try {
      setLoading(true)
      const response = await fetch('/api/gmail/credentials')
      if (!response.ok) {
        throw new Error('Failed to check Gmail status')
      }
      const { hasCredentials } = await response.json()
      setIsConnected(hasCredentials)
      setError(null)
    } catch (err) {
      console.error('Gmail status check error:', err)
      setError('Failed to check Gmail status')
      setIsConnected(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkStatus()
  }, [])

  return {
    isConnected,
    loading,
    error,
    checkStatus // Expose this to allow manual refresh
  }
} 