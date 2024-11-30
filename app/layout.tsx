import { ColorThemeProvider } from '@/lib/contexts/ColorThemeContext'
import { Header } from '@/components/header'
import './globals.css'
import { IBM_Plex_Mono } from 'next/font/google'

const ibmPlexMono = IBM_Plex_Mono({ 
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <ColorThemeProvider>
          <Header />
          <main>
            {children}
          </main>
        </ColorThemeProvider>
      </body>
    </html>
  )
}
