'use client'

import { GmailSettings } from '@/components/gmail-settings'
import Link from 'next/link'
import { Card } from '@/components/ui/card'

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
          
          <Card className="p-6">
            <div className="space-y-1.5 pb-4">
              <h3 className="font-semibold text-lg leading-none">Data Management</h3>
              <p className="text-sm text-gray-500">
                Manage your data mappings and integrations
              </p>
            </div>
            <div className="space-y-4">
              <Link 
                href="/settings/smart-mappings" 
                className="flex items-center justify-between p-3 border rounded-md hover:bg-gray-50"
              >
                <div>
                  <h4 className="font-medium">Smart Mappings</h4>
                  <p className="text-sm text-gray-500">
                    View and manage product and supplier mappings
                  </p>
                </div>
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="24" 
                  height="24" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="text-gray-400"
                >
                  <path d="m9 18 6-6-6-6"/>
                </svg>
              </Link>
            </div>
          </Card>
          
          {/* Add more settings sections here */}
        </div>
      </div>
    </div>
  )
} 