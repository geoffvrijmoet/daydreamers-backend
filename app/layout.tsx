import {
  ClerkProvider,
} from '@clerk/nextjs'
import './globals.css'
import type { Metadata } from 'next'
import { Quicksand } from 'next/font/google'
import { Toaster } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import ClientLayout from '../components/client-layout'

const quicksand = Quicksand({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Daydreamers Pet Supply',
  description: 'Inventory and sales management for Daydreamers Pet Supply',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          {/* ... existing head content ... */}
        </head>
        <body className={cn(quicksand.className, "flex flex-col min-h-screen")}>
          <div className="flex flex-col flex-1 w-full">
            <ClientLayout>
              {children}
            </ClientLayout>
            <Toaster />
          </div>
        </body>
      </html>
    </ClerkProvider>
  )
}
