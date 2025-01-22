'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus } from 'lucide-react'
import Link from 'next/link'

interface Supplier {
  _id: string
  name: string
  aliases: string[]
  invoiceEmail: string
  invoiceSubjectPattern: string
  skuPrefix: string
  createdAt: Date
  updatedAt: Date
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSuppliers() {
      try {
        const response = await fetch('/api/suppliers')
        if (!response.ok) {
          throw new Error('Failed to fetch suppliers')
        }
        const data = await response.json()
        setSuppliers(data.suppliers)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchSuppliers()
  }, [])

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Suppliers</h1>
        </div>
        <div className="text-center py-8">Loading suppliers...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Suppliers</h1>
        </div>
        <div className="text-red-500 text-center py-8">{error}</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <Link href="/suppliers/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Supplier
          </Button>
        </Link>
      </div>

      <div className="grid gap-4">
        {suppliers.map((supplier) => (
          <Card key={supplier._id} className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold mb-2">{supplier.name}</h2>
                <div className="space-y-1 text-sm text-gray-500">
                  <p>SKU Prefix: {supplier.skuPrefix}</p>
                  <p>Email: {supplier.invoiceEmail}</p>
                  <p>Aliases: {supplier.aliases.join(', ')}</p>
                </div>
              </div>
              <Link href={`/suppliers/${supplier._id}/edit`}>
                <Button variant="outline">Edit</Button>
              </Link>
            </div>
          </Card>
        ))}

        {suppliers.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No suppliers found. Add your first supplier to get started.
          </div>
        )}
      </div>
    </div>
  )
} 