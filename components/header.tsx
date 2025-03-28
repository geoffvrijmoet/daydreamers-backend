'use client'

import Link from 'next/link'
import { Logo } from '@/components/logo'
import { usePathname } from 'next/navigation'

export function Header() {
  const pathname = usePathname()

  return (
    <header className="hidden md:block border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-3">
            <Logo />
            <span className="text-xl font-medium">
              Daydreamers
            </span>
          </Link>

          <nav className="flex space-x-8">
            <Link
              href="/"
              className={`${
                pathname === '/'
                  ? 'text-primary-600 border-b-2 border-primary-400'
                  : 'text-gray-500 hover:text-gray-700'
              } py-4 text-sm font-medium`}
            >
              Dashboard
            </Link>
            <Link
              href="/products"
              className={`${
                pathname === '/products'
                  ? 'text-primary-600 border-b-2 border-primary-400'
                  : 'text-gray-500 hover:text-gray-700'
              } py-4 text-sm font-medium`}
            >
              Products
            </Link>
            <Link
              href="/suppliers"
              className={`${
                pathname === '/suppliers'
                  ? 'text-primary-600 border-b-2 border-primary-400'
                  : 'text-gray-500 hover:text-gray-700'
              } py-4 text-sm font-medium`}
            >
              Suppliers
            </Link>
            <Link
              href="/amex-excel"
              className={`${
                pathname === '/amex-excel'
                  ? 'text-primary-600 border-b-2 border-primary-400'
                  : 'text-gray-500 hover:text-gray-700'
              } py-4 text-sm font-medium`}
            >
              AMEX Excel
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
} 