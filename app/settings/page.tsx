'use client'

import { GmailSettings } from '@/components/gmail-settings'

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Settings
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage your integrations and preferences
          </p>
        </div>

        <div className="space-y-6">
          <GmailSettings />
          
          {/* Add more settings sections here */}
        </div>
      </div>
    </div>
  )
} 