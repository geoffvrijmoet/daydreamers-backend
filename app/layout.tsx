import { Header } from '@/components/header'
import './globals.css'
import { Quicksand } from 'next/font/google'

const quicksand = Quicksand({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-quicksand',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={quicksand.variable}>
      <body className="min-h-screen bg-white font-quicksand">
        <Header />
        <main>
          {children}
        </main>
      </body>
    </html>
  )
}
