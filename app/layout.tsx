import {
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton
} from '@clerk/nextjs'
import './globals.css'
import type { Metadata } from 'next'
import { Quicksand } from 'next/font/google'
import { Header } from '@/components/header'
import { Toaster } from '@/components/ui/toaster'

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
        <body className={`${quicksand.className} flex flex-col min-h-screen`}>
          <div className="min-h-screen flex flex-col">
            <div className="flex justify-end p-4">
              <SignedOut>
                <SignInButton />
              </SignedOut>
              <SignedIn>
                <UserButton />
              </SignedIn>
            </div>
            <SignedIn>
              <Header />
            </SignedIn>
            <main className="flex-1">
              {children}
            </main>
            <Toaster />
          </div>
        </body>
      </html>
    </ClerkProvider>
  )
}
