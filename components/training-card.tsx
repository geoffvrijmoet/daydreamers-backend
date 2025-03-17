'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toEasternTime, formatInEasternTime } from '@/lib/utils/dates'
import { formatNumberWithCommas } from "@/lib/utils"

interface TrainingData {
  _id: string
  id: string
  date: string
  type: 'training'
  amount: number
  preTaxAmount: number
  taxAmount: number
  trainer: string
  clientName?: string
  customer?: string // Fallback if clientName isn't available
  dogName?: string
  trainingType?: string
  sessionDuration?: number
  sessionNumber?: number
  totalSessions?: number
  sessionNotes?: string
  paymentMethod?: string
  status?: 'completed' | 'cancelled' | 'refunded' | 'void'
}

export function TrainingCard() {
  const [trainingSessions, setTrainingSessions] = useState<TrainingData[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetchTrainingSessions()
  }, [])

  const fetchTrainingSessions = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/transactions?type=training&limit=10')
      if (response.ok) {
        const data = await response.json()
        setTrainingSessions(data.transactions)
      }
    } catch (error) {
      console.error('Error fetching training sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = toEasternTime(dateString)
    return formatInEasternTime(date, 'MMMM d, yyyy h:mm a')
  }

  const getClientName = (session: TrainingData) => {
    return session.clientName || session.customer || 'Unknown Client'
  }

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Training Sessions</CardTitle>
          <CardDescription>Loading training data...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (trainingSessions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Training Sessions</CardTitle>
          <CardDescription>No training sessions found</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end pt-0">
          <Button onClick={fetchTrainingSessions} variant="outline" size="sm">
            Refresh
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Training Sessions</CardTitle>
        <CardDescription>
          Showing the {trainingSessions.length} most recent training sessions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {trainingSessions.map((session) => (
            <Card key={session._id} className="overflow-hidden">
              <div 
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleExpand(session._id)}
              >
                <div>
                  <div className="font-medium">
                    {getClientName(session)} 
                    {session.dogName && session.dogName.trim() !== '' && <span className="text-gray-500"> with {session.dogName}</span>}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(session.date)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{session.trainingType && session.trainingType !== 'none' ? session.trainingType : "Training"}</Badge>
                  <span className="font-semibold">${formatNumberWithCommas(session.amount)}</span>
                </div>
              </div>
              
              {expandedId === session._id && (
                <div className="p-4 border-t bg-gray-50">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p><span className="font-medium">Trainer:</span> {session.trainer}</p>
                      <p><span className="font-medium">Type:</span> {session.trainingType && session.trainingType !== 'none' ? session.trainingType : "Not specified"}</p>
                      <p><span className="font-medium">Duration:</span> {session.sessionDuration ? `${session.sessionDuration} minutes` : "Not specified"}</p>
                      <p>
                        <span className="font-medium">Session:</span> 
                        {session.sessionNumber && session.totalSessions 
                          ? ` ${session.sessionNumber} of ${session.totalSessions}` 
                          : " Not specified"}
                      </p>
                    </div>
                    <div>
                      <p><span className="font-medium">Payment:</span> {session.paymentMethod || "Not specified"}</p>
                      <p><span className="font-medium">Total:</span> ${formatNumberWithCommas(session.amount)}</p>
                      <p><span className="font-medium">Pre-tax:</span> ${formatNumberWithCommas(session.preTaxAmount)}</p>
                      <p><span className="font-medium">Tax:</span> ${formatNumberWithCommas(session.taxAmount)}</p>
                    </div>
                  </div>
                  
                  {session.sessionNotes && (
                    <div className="mt-3">
                      <p className="font-medium">Notes:</p>
                      <p className="text-sm text-gray-700 mt-1">{session.sessionNotes}</p>
                    </div>
                  )}
                  
                  <div className="mt-3 flex justify-end">
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
        
        <div className="flex justify-end mt-4">
          <Button onClick={fetchTrainingSessions} variant="outline" size="sm">
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  )
} 