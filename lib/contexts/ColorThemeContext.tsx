'use client'

import { createContext, useContext, useState, useEffect } from 'react'

type ColorTheme = {
  primary: string
  secondary: string
  background: string
}

type ColorThemeContextType = {
  colors: ColorTheme
  updateColors: (newColors: Partial<ColorTheme>) => void
}

const ColorThemeContext = createContext<ColorThemeContextType | undefined>(undefined)

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const [colors, setColors] = useState<ColorTheme>({
    primary: '#d5bcff',
    secondary: '#bce0ff',
    background: '#ffffff'
  })

  // Load saved colors on mount
  useEffect(() => {
    async function loadTheme() {
      try {
        const response = await fetch('/api/theme')
        if (response.ok) {
          const savedColors = await response.json()
          if (savedColors) {
            setColors(savedColors)
            applyTheme(savedColors)
          }
        }
      } catch (error) {
        console.error('Failed to load theme:', error)
      }
    }

    loadTheme()
  }, [])

  const applyTheme = (theme: ColorTheme) => {
    // Update CSS custom properties
    document.documentElement.style.setProperty('--color-primary', theme.primary)
    document.documentElement.style.setProperty('--color-secondary', theme.secondary)
    document.documentElement.style.setProperty('--color-background', theme.background)
    
    // Apply background color to body and main content areas
    document.body.style.backgroundColor = theme.background
    document.querySelectorAll('.bg-gray-50').forEach(element => {
      (element as HTMLElement).style.backgroundColor = theme.background
    })
    
    // Update Tailwind classes dynamically
    const style = document.createElement('style')
    style.textContent = `
      :root {
        --color-primary: ${theme.primary};
        --color-secondary: ${theme.secondary};
        --color-background: ${theme.background};
      }
      
      body, .bg-gray-50 { background-color: ${theme.background} !important; }
      
      .bg-primary-400 { background-color: ${theme.primary} !important; }
      .bg-secondary-400 { background-color: ${theme.secondary} !important; }
      .text-primary-400 { color: ${theme.primary} !important; }
      .text-secondary-400 { color: ${theme.secondary} !important; }
      .hover\\:bg-primary-500:hover { background-color: ${theme.primary} !important; }
      .hover\\:bg-secondary-500:hover { background-color: ${theme.secondary} !important; }
      .hover\\:text-primary-500:hover { color: ${theme.primary} !important; }
      .hover\\:text-secondary-500:hover { color: ${theme.secondary} !important; }
    `
    
    // Remove any existing theme style tag
    const existingStyle = document.getElementById('theme-styles')
    if (existingStyle) {
      existingStyle.remove()
    }
    
    // Add the new style tag
    style.id = 'theme-styles'
    document.head.appendChild(style)
  }

  const updateColors = async (newColors: Partial<ColorTheme>) => {
    const updatedColors = { ...colors, ...newColors }
    setColors(updatedColors)
    applyTheme(updatedColors)

    // Save to database
    try {
      await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedColors)
      })
    } catch (error) {
      console.error('Failed to save theme:', error)
    }
  }

  return (
    <ColorThemeContext.Provider value={{ colors, updateColors }}>
      {children}
    </ColorThemeContext.Provider>
  )
}

export const useColorTheme = () => {
  const context = useContext(ColorThemeContext)
  if (!context) {
    throw new Error('useColorTheme must be used within a ColorThemeProvider')
  }
  return context
} 