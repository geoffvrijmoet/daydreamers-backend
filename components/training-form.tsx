'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Checkbox } from '@/components/ui/checkbox'

type TrainingSession = {
  id?: string
  date: string
  amount: number
  preTaxAmount: number
  taxAmount: number
  isTaxable: boolean
  type: 'training'
  paymentMethod: string
  description: string
  trainer: string
  clientName: string
  dogName?: string
  trainingType?: string
  sessionDuration?: number
  sessionNumber?: number
  totalSessions?: number
  sessionNotes?: string
}

type TrainingFormProps = {
  onSuccess?: () => void
  onCancel?: () => void
  isExpanded?: boolean
}

const TAX_RATE = 0.08875; // 8.875%

export function TrainingForm({ onSuccess, onCancel, isExpanded = false }: TrainingFormProps) {
  const [isOpen, setIsOpen] = useState(isExpanded)
  const [loading, setLoading] = useState(false)
  const [clientSuggestions, setClientSuggestions] = useState<string[]>([])
  const [showClientSuggestions, setShowClientSuggestions] = useState(false)
  const suggestionRef = useRef<HTMLDivElement>(null)
  
  const [trainingSession, setTrainingSession] = useState<TrainingSession>({
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    amount: 0,
    preTaxAmount: 0,
    taxAmount: 0,
    isTaxable: true,
    type: 'training',
    paymentMethod: 'Venmo',
    description: 'Dog training session',
    trainer: 'Madeline Pape',
    clientName: '',
    dogName: '',
    trainingType: 'none',
    sessionDuration: undefined,
    sessionNumber: undefined,
    totalSessions: undefined,
    sessionNotes: ''
  })

  // Effect to sync isOpen with isExpanded prop
  useEffect(() => {
    setIsOpen(isExpanded);
  }, [isExpanded]);

  // Fetch client suggestions when typing
  useEffect(() => {
    async function fetchClients() {
      if (trainingSession.clientName.length < 2) {
        setClientSuggestions([]);
        return;
      }
      
      try {
        // First try to search the dog training clients collection
        const dogClientResponse = await fetch(`/api/dog-training-clients/search?query=${encodeURIComponent(trainingSession.clientName)}&includeDogs=true`);
        
        if (dogClientResponse.ok) {
          const data = await dogClientResponse.json();
          
          if (data.clients && data.clients.length > 0) {
            // If we found dog training clients, use those
            setClientSuggestions(data.clients.map((c: { name: string }) => c.name));
            return;
          }
        }
        
        // Fall back to the general customers collection if no dog training clients found
        const response = await fetch(`/api/customers/search?query=${encodeURIComponent(trainingSession.clientName)}`);
        if (!response.ok) throw new Error('Failed to fetch customers');
        const data = await response.json();
        setClientSuggestions(data.customers.map((c: { name: string }) => c.name));
      } catch (error) {
        console.error('Error fetching clients:', error);
        setClientSuggestions([]);
      }
    }
    
    const delayDebounceFn = setTimeout(() => {
      fetchClients();
    }, 300);
    
    return () => clearTimeout(delayDebounceFn);
  }, [trainingSession.clientName]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowClientSuggestions(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showClientSuggestions]);

  const handleAmountChange = (amount: number) => {
    if (trainingSession.isTaxable) {
      // If taxable, calculate tax from the total amount
      const preTaxAmount = Number((amount / (1 + TAX_RATE)).toFixed(2));
      const taxAmount = Number((amount - preTaxAmount).toFixed(2));
      
      setTrainingSession(prev => ({
        ...prev,
        amount,
        preTaxAmount,
        taxAmount
      }));
    } else {
      // If not taxable, the entered amount is the pre-tax amount
      setTrainingSession(prev => ({
        ...prev,
        amount,
        preTaxAmount: amount,
        taxAmount: 0
      }));
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    setTrainingSession(prev => {
      // Update the isTaxable state
      const isTaxable = checked;
      
      // Recalculate amount fields based on new taxable state
      const amount = prev.amount;
      let preTaxAmount = prev.preTaxAmount;
      let taxAmount = prev.taxAmount;
      
      // If we've already entered an amount, recalculate
      if (amount > 0) {
        if (isTaxable) {
          // Switching to taxable - adjust amount to include tax
          preTaxAmount = Number((amount / (1 + TAX_RATE)).toFixed(2));
          taxAmount = Number((amount - preTaxAmount).toFixed(2));
        } else {
          // Switching to non-taxable - amount is now pre-tax amount
          preTaxAmount = amount;
          taxAmount = 0;
        }
      }
      
      return {
        ...prev,
        isTaxable,
        preTaxAmount,
        taxAmount
      };
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name === 'amount') {
      handleAmountChange(parseFloat(value) || 0);
      return;
    }
    
    // Show suggestions when typing in client name field and value is at least 2 chars
    if (name === 'clientName' && value.length >= 2) {
      setShowClientSuggestions(true);
    }
    
    setTrainingSession(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setTrainingSession(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSelectClient = (name: string) => {
    setTrainingSession(prev => ({
      ...prev,
      clientName: name
    }));
    setShowClientSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainingSession.clientName) {
      toast.error("Client name is required");
      return;
    }
    
    if (!trainingSession.amount || trainingSession.amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    
    setLoading(true);
    
    try {
      // Create a copy of the training session data and process fields
      const sessionData = {
        ...trainingSession,
        // Round the amount fields to two decimal places
        amount: Number(trainingSession.amount.toFixed(2)),
        preTaxAmount: Number(trainingSession.preTaxAmount.toFixed(2)),
        taxAmount: Number(trainingSession.taxAmount.toFixed(2)),
        // Convert 'none' to undefined for the API
        trainingType: trainingSession.trainingType === 'none' ? undefined : trainingSession.trainingType,
        source: 'manual',
        customer: trainingSession.clientName, // For compatibility with existing transaction model
        status: 'completed'
      };
      
      // Save the training session
      const response = await fetch('/api/transactions/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sessionData)
      });
      
      if (!response.ok) {
        throw new Error('Failed to save training session');
      }
      
      const responseData = await response.json();
      const transactionId = responseData.transaction?.id;
      
      // Check if this client already exists in the dog training clients collection
      const clientSearchResponse = await fetch(`/api/dog-training-clients/search?query=${encodeURIComponent(trainingSession.clientName)}`);
      const clientSearchData = await clientSearchResponse.json();
      const existingClient = clientSearchData.clients?.find((c: { name: string }) => 
        c.name.toLowerCase() === trainingSession.clientName.toLowerCase()
      );
      
      if (existingClient) {
        // Update the existing client with this session ID and revenue data
        const updateResponse = await fetch(`/api/dog-training-clients/${existingClient.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            trainingSessions: [...(existingClient.trainingSessions || []), transactionId],
            mostRecentSessionDate: new Date().toISOString(),
            // Use the increment and add features
            incrementSessionCount: true,
            addRevenue: trainingSession.amount,
            addSales: trainingSession.preTaxAmount,
            addTax: trainingSession.taxAmount
          })
        });
        
        if (!updateResponse.ok) {
          console.error('Warning: Failed to update dog training client record');
        }
      } else {
        // Create a new dog training client with this dog and session
        const createClientResponse = await fetch('/api/dog-training-clients', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: trainingSession.clientName,
            dogs: trainingSession.dogName 
              ? [{ 
                  name: trainingSession.dogName,
                  behavioralNotes: trainingSession.sessionNotes
                }] 
              : [],
            trainingSessions: [transactionId],
            isActive: true,
            // Initialize revenue tracking fields
            sessionCount: 1,
            totalRevenue: trainingSession.amount,
            totalSales: trainingSession.preTaxAmount,
            totalTax: trainingSession.taxAmount,
            firstSessionDate: new Date().toISOString(),
            mostRecentSessionDate: new Date().toISOString()
          })
        });
        
        if (!createClientResponse.ok) {
          console.error('Warning: Failed to create dog training client record');
        }
      }
      
      toast.success('Training session added successfully');
      setTrainingSession({
        date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        amount: 0,
        preTaxAmount: 0,
        taxAmount: 0,
        isTaxable: true,
        type: 'training',
        paymentMethod: 'Cash',
        description: 'Dog training session',
        trainer: 'Madeline Pape',
        clientName: '',
        dogName: '',
        trainingType: 'none',
        sessionDuration: undefined,
        sessionNumber: undefined,
        totalSessions: undefined,
        sessionNotes: ''
      });
      
      if (onSuccess) {
        onSuccess();
      }

      setIsOpen(false);
    } catch (error) {
      console.error('Error saving training session:', error);
      toast.error('Failed to save training session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-md rounded-md p-4">
      {!isOpen ? (
        <Button 
          onClick={() => setIsOpen(true)}
          className="w-full"
        >
          Add Training Session
        </Button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="date">Date & Time</Label>
            <Input
              id="date"
              name="date"
              type="datetime-local"
              value={trainingSession.date}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="amount">Total Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2">$</span>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                className="pl-7"
                value={trainingSession.amount || ''}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="isTaxable" 
                checked={trainingSession.isTaxable} 
                onCheckedChange={handleCheckboxChange}
              />
              <Label htmlFor="isTaxable" className="text-sm font-normal cursor-pointer">
                Include sales tax (8.875%)
              </Label>
            </div>
            {trainingSession.amount > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                <p>Pre-tax: ${trainingSession.preTaxAmount.toFixed(2)}</p>
                <p>Tax (8.875%): ${trainingSession.taxAmount.toFixed(2)}</p>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment Method</Label>
            <Select
              value={trainingSession.paymentMethod}
              onValueChange={(value) => handleSelectChange('paymentMethod', value)}
            >
              <SelectTrigger id="paymentMethod">
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Credit Card">Credit Card</SelectItem>
                <SelectItem value="Square">Square</SelectItem>
                <SelectItem value="Venmo">Venmo</SelectItem>
                <SelectItem value="Zelle">Zelle</SelectItem>
                <SelectItem value="Cash App">Cash App</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="trainer">Trainer</Label>
            <Input
              id="trainer"
              name="trainer"
              value={trainingSession.trainer}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="space-y-2 relative" ref={suggestionRef}>
            <Label htmlFor="clientName">Client Name</Label>
            <Input
              id="clientName"
              name="clientName"
              value={trainingSession.clientName}
              onChange={handleInputChange}
              onFocus={() => setShowClientSuggestions(true)}
              required
              autoComplete="off"
              placeholder="Start typing to search clients..."
            />
            {showClientSuggestions && clientSuggestions.length > 0 && (
              <div className="absolute z-10 w-full bg-white shadow-lg rounded-md mt-1 max-h-60 overflow-auto">
                {clientSuggestions.map((name, index) => (
                  <div
                    key={index}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleSelectClient(name)}
                  >
                    {name}
                  </div>
                ))}
              </div>
            )}
            {showClientSuggestions && trainingSession.clientName.length >= 2 && clientSuggestions.length === 0 && (
              <div className="absolute z-10 w-full bg-white shadow-lg rounded-md mt-1 p-2 text-gray-500 text-sm">
                No matching clients found
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="dogName">Dog&apos;s Name</Label>
            <Input
              id="dogName"
              name="dogName"
              value={trainingSession.dogName || ''}
              onChange={handleInputChange}
              placeholder="Optional"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="trainingType">Training Type</Label>
            <Select
              value={trainingSession.trainingType || 'none'}
              onValueChange={(value) => handleSelectChange('trainingType', value)}
            >
              <SelectTrigger id="trainingType">
                <SelectValue placeholder="Select training type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not specified</SelectItem>
                <SelectItem value="Basic Manners">Basic Manners</SelectItem>
                <SelectItem value="Advanced Manners">Advanced Manners</SelectItem>
                <SelectItem value="Behavior Modification">Behavior Modification</SelectItem>
                <SelectItem value="Puppy Training">Puppy Training</SelectItem>
                <SelectItem value="Specialized Training">Specialized Training</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sessionDuration">Duration (minutes)</Label>
              <Input
                id="sessionDuration"
                name="sessionDuration"
                type="number"
                min="15"
                step="15"
                value={trainingSession.sessionDuration || ''}
                onChange={handleInputChange}
                placeholder="Optional"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sessionNumber">Session #</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="sessionNumber"
                  name="sessionNumber"
                  type="number"
                  min="1"
                  value={trainingSession.sessionNumber || ''}
                  onChange={handleInputChange}
                  placeholder="Optional"
                />
                <span>of</span>
                <Input
                  id="totalSessions"
                  name="totalSessions" 
                  type="number"
                  min="1"
                  value={trainingSession.totalSessions || ''}
                  onChange={handleInputChange}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="sessionNotes">Session Notes</Label>
            <Textarea
              id="sessionNotes"
              name="sessionNotes"
              rows={3}
              value={trainingSession.sessionNotes || ''}
              onChange={handleInputChange}
              placeholder="Notes about the training session"
            />
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsOpen(false);
                if (onCancel) onCancel();
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Training Session'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
} 