'use client'

import Link from 'next/link'
import { Logo } from '@/components/logo'

export function Header() {
  return (
    <header className="border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col items-center gap-2">
          <Link href="/" className="flex items-center space-x-3">
            <Logo />
            <span className="text-xl">
              Daydreamers
            </span>
          </Link>
          <span className="text-sm text-gray-500">
            Dashboard
          </span>
        </div>
      </div>
    </header>
  )
} 