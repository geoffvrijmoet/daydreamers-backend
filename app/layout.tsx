import { ColorThemeProvider } from '@/lib/contexts/ColorThemeContext'
import { Header } from '@/components/header'
import './globals.css'

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
