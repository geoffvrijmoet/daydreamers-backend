import { ObjectId, Db } from 'mongodb';
import { connectToDatabase } from '@/lib/mongoose';
import { SmartMappingSchema, createSmartMapping, incrementMappingUsage, MappingTypes } from '@/lib/models/smart-mapping';
import mongoose from 'mongoose';

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
      await connectToDatabase();
      
      // Normalize the source string (lowercase, trim)
      const normalizedSource = source.toLowerCase().trim();
      
      // Look for an exact match first
      const mapping = await (mongoose.connection.db as Db).collection(this.COLLECTION_NAME).findOne({
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
      await connectToDatabase();
      
      // Normalize the source and target
      const normalizedSource = source.toLowerCase().trim();
      
      // Check if mapping already exists
      const existingMapping = await (mongoose.connection.db as Db).collection(this.COLLECTION_NAME).findOne({
        mappingType,
        source: normalizedSource
      }) as SmartMappingSchema | null;
      
      if (existingMapping) {
        // Update the existing mapping
        const updatedMapping = incrementMappingUsage(existingMapping);
        
        // If target changed, update it and adjust confidence
        if (existingMapping.target !== target) {
          updatedMapping.target = target;
          updatedMapping.targetId = targetId;
          
          // Only reduce confidence if usage count is low
          if (updatedMapping.usageCount < 3) {
            updatedMapping.confidence = Math.max(60, existingMapping.confidence - 10);
          }
          
          if (metadata) {
            updatedMapping.metadata = {
              ...existingMapping.metadata,
              ...metadata
            };
          }
        }
        
        await (mongoose.connection.db as Db).collection(this.COLLECTION_NAME).updateOne(
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
        const result = await (mongoose.connection.db as Db).collection(this.COLLECTION_NAME).insertOne({
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
      await connectToDatabase();
      
      // Normalize the source
      const normalizedSource = source.toLowerCase().trim();
      
      // Find exact match first
      const exactMatch = await (mongoose.connection.db as Db).collection(this.COLLECTION_NAME).findOne({
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
      const matches = await (mongoose.connection.db as Db).collection(this.COLLECTION_NAME)
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
   * Gets high-confidence product matches that can be used automatically without user confirmation
   * Returns only mappings with a confidence level above the threshold and with multiple usages
   */
  static async getAutoConfirmedProductMappings(
    confidenceThreshold = 85,
    minUsageCount = 3
  ): Promise<Record<string, { productId: string, productName: string, confidence: number }>> {
    try {
      await connectToDatabase();
      
      // Find all high-confidence product mappings
      const mappings = await (mongoose.connection.db as Db).collection(this.COLLECTION_NAME)
        .find({
          mappingType: MappingTypes.PRODUCT_NAMES,
          confidence: { $gte: confidenceThreshold },
          usageCount: { $gte: minUsageCount },
          targetId: { $exists: true }
        })
        .toArray() as SmartMappingSchema[];
      
      // Convert to a lookup map with source as key
      return mappings.reduce((result, mapping) => {
        result[mapping.source] = {
          productId: mapping.targetId as string,
          productName: mapping.target,
          confidence: mapping.confidence
        };
        return result;
      }, {} as Record<string, { productId: string, productName: string, confidence: number }>);
    } catch (error) {
      console.error('Error getting auto-confirmed mappings:', error);
      return {};
    }
  }
  
  /**
   * Record an email-to-supplier mapping
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
   * Prune old mappings if we exceed the maximum per type
   */
  private static async pruneOldMappingsIfNeeded(mappingType: string): Promise<void> {
    try {
      await connectToDatabase();
      
      const count = await (mongoose.connection.db as Db).collection(this.COLLECTION_NAME)
        .countDocuments({ mappingType });
      
      if (count >= this.MAX_MAPPINGS_PER_TYPE) {
        // Remove oldest mappings until we're under the limit
        await (mongoose.connection.db as Db).collection(this.COLLECTION_NAME)
          .deleteMany({
            mappingType,
            usageCount: 0
          });
      }
    } catch (error) {
      console.error('Error pruning old mappings:', error);
    }
  }
} 