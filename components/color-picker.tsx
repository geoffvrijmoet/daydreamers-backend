'use client'

import { useColorTheme } from '@/lib/contexts/ColorThemeContext'

type ColorPickerProps = {
  label: string
  colorType: 'primary' | 'secondary' | 'background'
}

export function ColorPicker({ label, colorType }: ColorPickerProps) {
  const { colors, updateColors } = useColorTheme()

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateColors({ [colorType]: e.target.value })
  }

  return (
    <div className="relative flex items-center space-x-2">
      <label className="text-sm text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <input
        type="color"
        value={colors[colorType]}
        onChange={handleColorChange}
        className="w-8 h-8 rounded-full border border-gray-300 cursor-pointer bg-transparent"
        style={{ 
          backgroundColor: colors[colorType],
          WebkitAppearance: 'none',
          MozAppearance: 'none'
        }}
      />
    </div>
  )
} 