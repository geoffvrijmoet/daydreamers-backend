import { NextResponse } from 'next/server';
import { SmartMappingService } from '@/lib/services/smart-mapping-service';
import { MappingTypes } from '@/lib/models/smart-mapping';

/**
 * GET /api/smart-mapping
 * Get suggested mappings for a source value and type
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mappingType = url.searchParams.get('mappingType');
    const source = url.searchParams.get('source');
    
    if (!mappingType || !source) {
      return NextResponse.json({ error: 'mappingType and source are required' }, { status: 400 });
    }
    
    // Validate mapping type
    const validTypes = Object.values(MappingTypes);
    if (!validTypes.includes(mappingType)) {
      return NextResponse.json({ error: `Invalid mappingType. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }
    
    // Get suggestions based on mapping type
    let suggestions;
    
    if (mappingType === MappingTypes.PRODUCT_NAMES) {
      suggestions = await SmartMappingService.suggestProductsForName(source);
    } else {
      const mappings = await SmartMappingService.suggestMappings(mappingType, source);
      suggestions = mappings.map(m => ({
        source: m.source,
        target: m.target,
        targetId: m.targetId,
        confidence: m.confidence,
        usageCount: m.usageCount
      }));
    }
    
    return NextResponse.json({ 
      success: true,
      mappingType,
      source,
      suggestions
    });
  } catch (error) {
    console.error('Error getting smart mappings:', error);
    return NextResponse.json(
      { error: 'Failed to get smart mappings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/smart-mapping
 * Create or update a mapping
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mappingType, source, target, targetId, metadata } = body;
    
    if (!mappingType || !source || !target) {
      return NextResponse.json({ error: 'mappingType, source, and target are required' }, { status: 400 });
    }
    
    // Validate mapping type
    const validTypes = Object.values(MappingTypes);
    if (!validTypes.includes(mappingType)) {
      return NextResponse.json({ error: `Invalid mappingType. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }
    
    // Handle different mapping types
    let result;
    
    if (mappingType === MappingTypes.PRODUCT_NAMES) {
      if (!targetId) {
        return NextResponse.json({ error: 'targetId is required for product mappings' }, { status: 400 });
      }
      
      result = await SmartMappingService.recordProductMapping(source, target, targetId);
    } else if (mappingType === MappingTypes.EMAIL_SUPPLIER) {
      result = await SmartMappingService.recordEmailSupplierMapping(source, target, metadata);
    } else {
      result = await SmartMappingService.createOrUpdateMapping(mappingType, source, target, targetId, metadata);
    }
    
    if (!result) {
      return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      mapping: {
        mappingType: result.mappingType,
        source: result.source,
        target: result.target,
        targetId: result.targetId,
        confidence: result.confidence,
        usageCount: result.usageCount
      }
    });
  } catch (error) {
    console.error('Error creating smart mapping:', error);
    return NextResponse.json(
      { error: 'Failed to create smart mapping' },
      { status: 500 }
    );
  }
} 