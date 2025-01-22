'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NewSupplierPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    aliases: '',
    invoiceEmail: '',
    invoiceSubjectPattern: '',
    skuPrefix: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          aliases: formData.aliases.split(',').map(a => a.trim()).filter(Boolean)
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create supplier')
      }

      router.push('/suppliers')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create supplier')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <Link href="/suppliers" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Suppliers
        </Link>
      </div>

      <Card className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Add New Supplier</h1>

        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded-md mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <Input
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="e.g. Viva Raw"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Aliases (comma-separated)</label>
            <Input
              name="aliases"
              value={formData.aliases}
              onChange={handleChange}
              placeholder="e.g. SP VIVA RAW, VIVA RAW LLC"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Invoice Email</label>
            <Input
              name="invoiceEmail"
              type="email"
              value={formData.invoiceEmail}
              onChange={handleChange}
              required
              placeholder="e.g. info@vivarawpets.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Invoice Subject Pattern</label>
            <Input
              name="invoiceSubjectPattern"
              value={formData.invoiceSubjectPattern}
              onChange={handleChange}
              required
              placeholder="e.g. Viva Raw Order #(\d+) confirmed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">SKU Prefix</label>
            <Input
              name="skuPrefix"
              value={formData.skuPrefix}
              onChange={handleChange}
              required
              placeholder="e.g. VIVR"
            />
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Supplier'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
} 