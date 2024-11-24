'use client'

import { useState } from 'react'
import { Card } from "@/components/ui/card"
import { useGmailStatus } from '@/lib/hooks/useGmailStatus'

export function GmailSettings() {
  const { isConnected, loading, error, checkStatus } = useGmailStatus()
  const [authError, setAuthError] = useState<string | null>(null)

  async function handleConnect() {
    try {
      setAuthError(null)
      // Get auth URL
      const response = await fetch('/api/gmail/auth')
      const { authUrl } = await response.json()

      // Open popup for auth
      const width = 600
      const height = 600
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      const popup = window.open(
        authUrl,
        'Gmail Authorization',
        `width=${width},height=${height},left=${left},top=${top}`
      )

      // Listen for auth completion
      window.addEventListener('message', async (event) => {
        if (event.data.type === 'GMAIL_AUTH_SUCCESS') {
          if (popup) popup.close()
          
          // Save credentials
          const response = await fetch('/api/gmail/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: event.data.code })
          })

          if (response.ok) {
            await checkStatus() // Refresh the connection status
          } else {
            setAuthError('Failed to complete Gmail authentication')
          }
        }
      })
    } catch (error) {
      setAuthError('Failed to start Gmail authentication')
    }
  }

  async function handleDisconnect() {
    try {
      await fetch('/api/gmail/credentials', { method: 'DELETE' })
      await checkStatus() // Refresh the connection status
    } catch (error) {
      setAuthError('Failed to disconnect Gmail')
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
        Gmail Integration
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Connect your Gmail account to automatically import American Express purchase emails
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Checking connection status...</p>
      ) : error || authError ? (
        <p className="text-sm text-red-600 mb-4">{error || authError}</p>
      ) : isConnected ? (
        <div className="space-y-4">
          <div className="flex items-center">
            <span className="flex h-3 w-3 mr-2">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="text-sm text-gray-900 dark:text-white">Connected to Gmail</span>
          </div>
          <button
            onClick={handleDisconnect}
            className="text-sm text-red-600 hover:text-red-800"
          >
            Disconnect Gmail
          </button>
        </div>
      ) : (
        <button
          onClick={handleConnect}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-400 hover:bg-primary-500"
        >
          Connect Gmail
        </button>
      )}
    </Card>
  )
} 