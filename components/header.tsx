'use client'

import Link from 'next/link'
import { Logo } from '@/components/logo'
import { ColorPicker } from '@/components/color-picker'
import { useGmailStatus } from '@/lib/hooks/useGmailStatus'

export function Header() {
  const { isConnected, loading } = useGmailStatus()

  return (
    <header className="bg-white dark:bg-gray-900 shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-3">
            <Logo />
            <span className="text-xl font-semibold text-gray-900 dark:text-white">
              Daydreamers
            </span>
          </Link>
          
          <div className="flex items-center space-x-6">
            {/* Color Pickers */}
            <div className="flex space-x-2 mr-6">
              <ColorPicker label="Main" colorType="primary" />
              <ColorPicker label="Secondary" colorType="secondary" />
              <ColorPicker label="Background" colorType="background" />
            </div>

            {/* Navigation */}
            <nav className="flex space-x-4">
              <Link 
                href="/"
                className="text-gray-600 hover:text-primary-500 dark:text-gray-300 dark:hover:text-primary-400"
              >
                Dashboard
              </Link>
              <Link 
                href="/products"
                className="text-gray-600 hover:text-primary-500 dark:text-gray-300 dark:hover:text-primary-400"
              >
                Products
              </Link>
              <Link 
                href="/settings"
                className="text-gray-600 hover:text-primary-500 dark:text-gray-300 dark:hover:text-primary-400 flex items-center"
              >
                Settings
                {!loading && !isConnected && (
                  <span className="relative flex h-2 w-2 ml-1">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                )}
              </Link>
            </nav>
          </div>
        </div>
      </div>
    </header>
  )
} 