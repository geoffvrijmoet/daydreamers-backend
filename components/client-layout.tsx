'use client'

import { useState, useEffect } from 'react'
import {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton
} from '@clerk/nextjs'
import { Header } from '@/components/header'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false)
  
  useEffect(() => {
    setIsClient(true)
  }, [])
  
  return (
    <>
      <div className="flex justify-end p-4">
        <SignedOut>
          <SignInButton />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
      {isClient && (
        <SignedIn>
          <Header />
        </SignedIn>
      )}
      <main className="flex-1">
        {children}
      </main>
    </>
  )
} 