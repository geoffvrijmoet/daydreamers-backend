'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function GmailCallback() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Processing...')
  
  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code')
      const error = searchParams.get('error')

      if (error) {
        console.error('Auth error:', error)
        setStatus('Authentication failed')
        return
      }

      if (!code) {
        console.error('No code received')
        setStatus('No authorization code received')
        return
      }

      try {
        if (window.opener) {
          window.opener.postMessage({
            type: 'GMAIL_AUTH_SUCCESS',
            code
          }, window.location.origin)
          setStatus('Authorization successful! You can close this window.')
          setTimeout(() => window.close(), 2000)
        } else {
          setStatus('Popup window not found')
        }
      } catch (error) {
        console.error('Callback error:', error)
        setStatus('Failed to complete authentication')
      }
    }

    handleCallback()
  }, [searchParams])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
          Gmail Authorization
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {status}
        </p>
      </div>
    </div>
  )
} 