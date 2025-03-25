import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import mongoose from 'mongoose';
import { MappingTypes } from '@/lib/models/smart-mapping';
import { Db, Document, WithId, Collection } from 'mongodb';

interface TypeCount extends Document {
  _id: string;
  count: number;
}

interface SmartMapping extends Document {
  _id: string;
  mappingType: string;
  source: string;
  target: string;
  targetId: string;
  confidence: number;
  usageCount: number;
  score: number;
  lastUsed: Date;
  createdAt: Date;
}

/**
 * GET /api/smart-mapping/list
 * Get a list of smart mappings with optional filtering
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mappingType = url.searchParams.get('mappingType');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const source = url.searchParams.get('source');
    
    await connectToDatabase();
    const query: Record<string, string | { $regex: string, $options: string }> = {};
    
    // Filter by mapping type if provided
    if (mappingType) {
      // Validate mapping type
      const validTypes = Object.values(MappingTypes);
      if (!validTypes.includes(mappingType)) {
        return NextResponse.json({ error: `Invalid mappingType. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
      }
      
      query.mappingType = mappingType;
    }
    
    // Filter by source if provided
    if (source) {
      query.source = { $regex: source, $options: 'i' };
    }
    
    const db = mongoose.connection.db as Db;
    const smartMappingsCollection = db.collection('smart_mappings') as Collection<SmartMapping>;
    
    // Get mappings
    const mappings = await smartMappingsCollection
      .find(query)
      .sort({ score: -1, usageCount: -1 })
      .limit(limit)
      .toArray();
    
    // Count total mappings
    const totalMappings = await smartMappingsCollection.countDocuments({});
    const typeCounts = await smartMappingsCollection.aggregate<TypeCount>([
      { $group: { _id: '$mappingType', count: { $sum: 1 } } }
    ]).toArray();
    
    return NextResponse.json({
      success: true,
      totalMappings,
      typeCounts: typeCounts.map((t: TypeCount) => ({ type: t._id, count: t.count })),
      mappings: mappings.map((m: WithId<SmartMapping>) => ({
        id: m._id,
        mappingType: m.mappingType,
        source: m.source,
        target: m.target,
        targetId: m.targetId,
        confidence: m.confidence,
        usageCount: m.usageCount,
        score: m.score,
        lastUsed: m.lastUsed,
        createdAt: m.createdAt
      }))
    });
  } catch (error) {
    console.error('Error listing smart mappings:', error);
    return NextResponse.json(
      { error: 'Failed to list smart mappings' },
      { status: 500 }
    );
  }
} 