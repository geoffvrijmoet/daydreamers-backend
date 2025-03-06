'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MappingTypes } from '@/lib/models/smart-mapping';
import { toast } from 'sonner';

interface SmartMapping {
  id: string;
  mappingType: string;
  source: string;
  target: string;
  targetId?: string;
  confidence: number;
  usageCount: number;
  score?: number;
  lastUsed: string;
  createdAt: string;
}

interface TypeCount {
  type: string;
  count: number;
}

export default function SmartMappingsPage() {
  const [mappings, setMappings] = useState<SmartMapping[]>([]);
  const [totalMappings, setTotalMappings] = useState(0);
  const [typeCounts, setTypeCounts] = useState<TypeCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Fetch mappings from API
  const fetchMappings = useCallback(async () => {
    try {
      setLoading(true);
      
      // Build URL with filters
      let url = '/api/smart-mapping/list?limit=100';
      if (selectedType) url += `&mappingType=${selectedType}`;
      if (searchTerm) url += `&source=${encodeURIComponent(searchTerm)}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch mappings');
      }
      
      const data = await response.json();
      
      setMappings(data.mappings);
      setTotalMappings(data.totalMappings);
      setTypeCounts(data.typeCounts);
    } catch (error) {
      console.error('Error fetching mappings:', error);
      toast.error('Failed to load smart mappings');
    } finally {
      setLoading(false);
    }
  }, [selectedType, searchTerm]);
  
  // Load mappings on page load and when filters change
  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);
  
  // Delete a mapping
  const deleteMapping = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mapping?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/smart-mapping/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete mapping');
      }
      
      toast.success('Mapping deleted successfully');
      fetchMappings();
    } catch (error) {
      console.error('Error deleting mapping:', error);
      toast.error('Failed to delete mapping');
    }
  };
  
  // Helper to format dates
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch {
      return dateString;
    }
  };
  
  // Get mapping type label
  const getMappingTypeLabel = (type: string) => {
    switch (type) {
      case MappingTypes.PRODUCT_NAMES:
        return 'Product Names';
      case MappingTypes.EMAIL_SUPPLIER:
        return 'Email Supplier';
      case MappingTypes.EMAIL_PRODUCT:
        return 'Email Product';
      default:
        return type;
    }
  };
  
  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'bg-green-500';
    if (confidence >= 75) return 'bg-blue-500';
    if (confidence >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Smart Mappings</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-6">
          <div className="space-y-1.5 pb-4">
            <h3 className="font-semibold text-lg leading-none">Total Mappings</h3>
            <p className="text-sm text-gray-500">Number of smart mappings in the system</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{totalMappings}</p>
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="space-y-1.5 pb-4">
            <h3 className="font-semibold text-lg leading-none">Mapping Types</h3>
            <p className="text-sm text-gray-500">Distribution by type</p>
          </div>
          <div className="space-y-2">
            {typeCounts.map(typeCount => (
              <div key={typeCount.type} className="flex justify-between items-center">
                <span>{getMappingTypeLabel(typeCount.type)}</span>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800">
                  {typeCount.count}
                </span>
              </div>
            ))}
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="space-y-1.5 pb-4">
            <h3 className="font-semibold text-lg leading-none">Filtering</h3>
            <p className="text-sm text-gray-500">Filter by type or search term</p>
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Types</SelectItem>
                  {Object.values(MappingTypes).map(type => (
                    <SelectItem key={type} value={type}>
                      {getMappingTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button onClick={fetchMappings} variant="outline">
                Refresh
              </Button>
            </div>
            
            <Input
              placeholder="Search by source term..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </Card>
      </div>
      
      <Card className="p-6">
        <div className="space-y-1.5 pb-4">
          <h3 className="font-semibold text-lg leading-none">Smart Mappings</h3>
          <p className="text-sm text-gray-500">
            Managed mappings between different data formats
          </p>
        </div>
        <div>
          {loading ? (
            <div className="text-center py-8">Loading mappings...</div>
          ) : mappings.length === 0 ? (
            <div className="text-center py-8">
              No mappings found. As you use the system, mappings will be created automatically.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4">Type</th>
                    <th className="text-left py-2 px-4">Source</th>
                    <th className="text-left py-2 px-4">Target</th>
                    <th className="text-center py-2 px-4">Confidence</th>
                    <th className="text-center py-2 px-4">Uses</th>
                    <th className="text-left py-2 px-4">Last Used</th>
                    <th className="text-center py-2 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map(mapping => (
                    <tr key={mapping.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-4">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border border-gray-200">
                          {getMappingTypeLabel(mapping.mappingType)}
                        </span>
                      </td>
                      <td className="py-2 px-4 max-w-xs truncate">{mapping.source}</td>
                      <td className="py-2 px-4 max-w-xs truncate">{mapping.target}</td>
                      <td className="py-2 px-4 text-center">
                        <div className="inline-flex items-center">
                          <div
                            className={`w-2 h-2 rounded-full mr-2 ${getConfidenceColor(mapping.confidence)}`}
                          />
                          {mapping.confidence}%
                        </div>
                      </td>
                      <td className="py-2 px-4 text-center">{mapping.usageCount}</td>
                      <td className="py-2 px-4">{formatDate(mapping.lastUsed)}</td>
                      <td className="py-2 px-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteMapping(mapping.id)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
} 