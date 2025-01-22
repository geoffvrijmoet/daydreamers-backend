'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ArrowLeft, Mail, Loader2, Copy, Check } from 'lucide-react'
import Link from 'next/link'

interface Supplier {
  _id: string
  name: string
  aliases: string[]
  invoiceEmail: string
  invoiceSubjectPattern: string
  skuPrefix: string
}

export default function EditSupplierPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFetchingEmail, setIsFetchingEmail] = useState(false)
  const [emailPreview, setEmailPreview] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    aliases: '',
    invoiceEmail: '',
    invoiceSubjectPattern: '',
    skuPrefix: ''
  })

  useEffect(() => {
    async function fetchSupplier() {
      try {
        const response = await fetch(`/api/suppliers/${params.id}`)
        if (!response.ok) {
          throw new Error('Failed to fetch supplier')
        }
        const data = await response.json()
        setFormData({
          ...data,
          aliases: data.aliases.join(', ')
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch supplier')
      } finally {
        setIsLoading(false)
      }
    }

    fetchSupplier()
  }, [params.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/suppliers/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          aliases: formData.aliases.split(',').map(a => a.trim()).filter(Boolean)
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update supplier')
      }

      router.push('/suppliers')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update supplier')
    } finally {
      setIsSaving(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleFetchSampleEmail = async () => {
    setIsFetchingEmail(true)
    setError(null)
    try {
      const response = await fetch(`/api/suppliers/${params.id}/sample-email`)
      if (!response.ok) {
        throw new Error('Failed to fetch sample email')
      }
      const data = await response.json()
      // Log the raw email text to the console
      console.log('Raw email text:', data.emailBody)
      setEmailPreview(data.emailBody)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sample email')
    } finally {
      setIsFetchingEmail(false)
    }
  }

  const handleCopyHtml = () => {
    if (emailPreview) {
      navigator.clipboard.writeText(emailPreview)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <div className="max-w-2xl mx-auto text-center py-8">
          Loading supplier details...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 text-red-500 p-4 rounded-md">
            {error}
          </div>
        </div>
      </div>
    )
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
        <h1 className="text-2xl font-bold mb-6">Edit Supplier</h1>

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

          <div className="border-t pt-6 mt-6">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleFetchSampleEmail}
                disabled={isFetchingEmail}
              >
                {isFetchingEmail ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Fetching Email...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Find Invoice Email
                  </>
                )}
              </Button>
            </div>

            {emailPreview && (
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">Rendered Email Preview</h3>
                  <div 
                    className="bg-white border rounded-md overflow-auto max-h-[400px]"
                    dangerouslySetInnerHTML={{ __html: emailPreview }}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium">Raw HTML</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyHtml}
                      className="h-8"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy HTML
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-md text-sm font-mono whitespace-pre-wrap overflow-auto max-h-[400px]">
                    {emailPreview}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/suppliers')}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
} 