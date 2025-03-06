import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/db';
import { SmartMappingSchema, createSmartMapping, incrementMappingUsage, MappingTypes } from '@/lib/models/smart-mapping';

/**
 * SmartMappingService - Lightweight service for learning and suggesting mappings
 * 
 * This service provides functions to:
 * 1. Record mappings when users make manual matches
 * 2. Suggest mappings based on past behavior
 * 3. Handle specialized mapping cases (products, emails)
 */
export class SmartMappingService {
  private static COLLECTION_NAME = 'smart_mappings';
  private static MAX_MAPPINGS_PER_TYPE = 500; // Limit to prevent DB bloat
  private static DEFAULT_MAX_RESULTS = 5;
  
  /**
   * Find a mapping by source and type
   */
  static async findMapping(
    mappingType: string, 
    source: string
  ): Promise<SmartMappingSchema | null> {
    try {
      const db = await getDb();
      
      // Normalize the source string (lowercase, trim)
      const normalizedSource = source.toLowerCase().trim();
      
      // Look for an exact match first
      const mapping = await db.collection(this.COLLECTION_NAME).findOne({
        mappingType,
        source: normalizedSource
      });
      
      if (mapping) {
        return mapping as SmartMappingSchema;
      }
      
      return null;
    } catch (error) {
      console.error('Error finding mapping:', error);
      return null;
    }
  }
  
  /**
   * Create or update a mapping
   */
  static async createOrUpdateMapping(
    mappingType: string,
    source: string,
    target: string,
    targetId?: string,
    metadata?: Record<string, unknown>
  ): Promise<SmartMappingSchema | null> {
    try {
      const db = await getDb();
      
      // Normalize the source and target
      const normalizedSource = source.toLowerCase().trim();
      
      // Check if mapping already exists
      const existingMapping = await db.collection(this.COLLECTION_NAME).findOne({
        mappingType,
        source: normalizedSource
      }) as SmartMappingSchema | null;
      
      if (existingMapping) {
        // Update the existing mapping
        const updatedMapping = incrementMappingUsage(existingMapping);
        
        // If target changed, update it and reset confidence
        if (existingMapping.target !== target) {
          updatedMapping.target = target;
          updatedMapping.targetId = targetId;
          updatedMapping.confidence = Math.max(60, existingMapping.confidence - 10); // Reduce confidence when target changes
          
          if (metadata) {
            updatedMapping.metadata = {
              ...existingMapping.metadata,
              ...metadata
            };
          }
        }
        
        await db.collection(this.COLLECTION_NAME).updateOne(
          { _id: existingMapping._id },
          { $set: updatedMapping }
        );
        
        return updatedMapping;
      } else {
        // Create a new mapping
        const newMapping = createSmartMapping(
          mappingType,
          normalizedSource,
          target,
          targetId,
          metadata
        );
        
        // Check if we need to prune old mappings to stay lightweight
        await this.pruneOldMappingsIfNeeded(mappingType);
        
        // Insert the new mapping
        const result = await db.collection(this.COLLECTION_NAME).insertOne({
          ...newMapping,
          _id: new ObjectId()
        });
        
        return {
          ...newMapping,
          _id: result.insertedId as ObjectId
        };
      }
    } catch (error) {
      console.error('Error creating/updating mapping:', error);
      return null;
    }
  }
  
  /**
   * Suggest mappings for a given source
   */
  static async suggestMappings(
    mappingType: string,
    source: string,
    maxResults = this.DEFAULT_MAX_RESULTS
  ): Promise<SmartMappingSchema[]> {
    try {
      const db = await getDb();
      
      // Normalize the source
      const normalizedSource = source.toLowerCase().trim();
      
      // Find exact match first
      const exactMatch = await db.collection(this.COLLECTION_NAME).findOne({
        mappingType,
        source: normalizedSource
      });
      
      if (exactMatch) {
        return [exactMatch as SmartMappingSchema];
      }
      
      // Find fuzzy matches based on parts of the string
      // This is a simple approach; for a production app, consider a proper text search or fuzzy matching library
      const words = normalizedSource.split(/\s+/).filter(w => w.length > 2);
      
      if (words.length === 0) {
        return [];
      }
      
      // Create a query that looks for partial matches
      const query = {
        mappingType,
        $or: words.map(word => ({
          source: { $regex: word, $options: 'i' }
        }))
      };
      
      // Find potential matches and sort by score/usageCount
      const matches = await db.collection(this.COLLECTION_NAME)
        .find(query)
        .sort({ score: -1, usageCount: -1 })
        .limit(maxResults)
        .toArray() as SmartMappingSchema[];
      
      return matches;
    } catch (error) {
      console.error('Error suggesting mappings:', error);
      return [];
    }
  }
  
  /**
   * Record a product name mapping
   */
  static async recordProductMapping(
    excelProductName: string,
    mongoProductName: string,
    mongoProductId: string
  ): Promise<SmartMappingSchema | null> {
    return this.createOrUpdateMapping(
      MappingTypes.PRODUCT_NAMES,
      excelProductName,
      mongoProductName,
      mongoProductId,
      { lastMatchedAt: new Date().toISOString() }
    );
  }
  
  /**
   * Suggest MongoDB products for an Excel product name
   */
  static async suggestProductsForName(
    excelProductName: string
  ): Promise<{ productId: string, productName: string, confidence: number }[]> {
    try {
      const suggestions = await this.suggestMappings(
        MappingTypes.PRODUCT_NAMES,
        excelProductName
      );
      
      return suggestions
        .filter(s => s.targetId) // Ensure we have a product ID
        .map(s => ({
          productId: s.targetId as string,
          productName: s.target,
          confidence: s.confidence
        }));
    } catch (error) {
      console.error('Error suggesting products:', error);
      return [];
    }
  }
  
  /**
   * Record an email supplier mapping
   */
  static async recordEmailSupplierMapping(
    emailPattern: string,
    supplierName: string,
    metadata?: Record<string, unknown>
  ): Promise<SmartMappingSchema | null> {
    return this.createOrUpdateMapping(
      MappingTypes.EMAIL_SUPPLIER,
      emailPattern,
      supplierName,
      undefined,
      metadata
    );
  }
  
  /**
   * Private method to keep the collection size in check
   * This ensures we don't exceed MongoDB's free tier limits
   */
  private static async pruneOldMappingsIfNeeded(mappingType: string): Promise<void> {
    try {
      const db = await getDb();
      
      // Count mappings of this type
      const count = await db.collection(this.COLLECTION_NAME).countDocuments({
        mappingType
      });
      
      if (count >= this.MAX_MAPPINGS_PER_TYPE) {
        // We need to prune - remove the oldest, least used mappings
        const mappingsToRemove = count - this.MAX_MAPPINGS_PER_TYPE + 10; // Remove extra to avoid frequent pruning
        
        const oldMappings = await db.collection(this.COLLECTION_NAME)
          .find({ mappingType })
          .sort({ score: 1, usageCount: 1, lastUsed: 1 })
          .limit(mappingsToRemove)
          .toArray();
        
        if (oldMappings.length > 0) {
          const ids = oldMappings.map(m => m._id);
          await db.collection(this.COLLECTION_NAME).deleteMany({
            _id: { $in: ids }
          });
          
          console.log(`Pruned ${oldMappings.length} old ${mappingType} mappings to stay within limits`);
        }
      }
    } catch (error) {
      console.error('Error pruning old mappings:', error);
    }
  }
} 