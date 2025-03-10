import { NextResponse } from 'next/server';
import { SmartMappingService } from '@/lib/services/smart-mapping-service';

/**
 * GET endpoint to retrieve high-confidence product mappings that can be applied automatically
 * 
 * Query parameters:
 * - confidenceThreshold: Minimum confidence level for auto-matching (default: 85)
 * - minUsageCount: Minimum number of times a mapping must have been used (default: 3)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const confidenceThreshold = parseInt(url.searchParams.get('confidenceThreshold') || '85', 10);
    const minUsageCount = parseInt(url.searchParams.get('minUsageCount') || '3', 10);
    
    // Get mappings that meet the confidence and usage criteria
    const autoConfirmedMappings = await SmartMappingService.getAutoConfirmedProductMappings(
      confidenceThreshold,
      minUsageCount
    );
    
    return NextResponse.json({
      success: true,
      mappingsCount: Object.keys(autoConfirmedMappings).length,
      mappings: autoConfirmedMappings
    });
  } catch (error) {
    console.error('Error retrieving auto-confirmed mappings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve auto-confirmed mappings' },
      { status: 500 }
    );
  }
} 