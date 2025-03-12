import { ObjectId } from 'mongodb';

/**
 * Smart Mapping Schema
 * 
 * A lightweight schema for storing learned mappings between different data formats.
 * Used to improve UX by remembering past matches and suggesting them in the future.
 */
export interface SmartMappingSchema {
  /**
   * MongoDB document ID
   */
  _id: ObjectId;
  
  /**
   * The type of mapping this represents
   * e.g., "product_names", "email_supplier", etc.
   */
  mappingType: string;
  
  /**
   * The original source value
   * e.g., "Viva Raw Turkey for Cats" from Excel
   */
  source: string;
  
  /**
   * The target value this maps to
   * e.g., "Viva Raw Turkey for Cats 1 lb - Regular" in MongoDB
   */
  target: string;
  
  /**
   * Unique identifier for the target object in our system
   * e.g., MongoDB Product ID
   */
  targetId?: string;
  
  /**
   * Confidence score (0-100)
   * Higher values indicate more confidence in this mapping
   */
  confidence: number;
  
  /**
   * Number of times this mapping has been used
   */
  usageCount: number;
  
  /**
   * Optional custom score for sorting/prioritizing mappings
   * Can be calculated based on usageCount, recency, etc.
   */
  score?: number;
  
  /**
   * When this mapping was last used
   */
  lastUsed: string;
  
  /**
   * Optional object for storing any additional
   * context-specific data about this mapping
   */
  metadata?: Record<string, unknown>;
  
  /**
   * When this mapping was first created
   */
  createdAt: string;
  
  /**
   * When this mapping was last updated
   */
  updatedAt: string;
}

/**
 * Creates a new smart mapping
 */
export function createSmartMapping(
  mappingType: string,
  source: string,
  target: string,
  targetId?: string,
  metadata?: Record<string, unknown>
): Omit<SmartMappingSchema, '_id'> {
  const now = new Date().toISOString();
  
  return {
    mappingType,
    source,
    target,
    targetId,
    confidence: 80, // Start with a reasonable confidence
    usageCount: 1,
    score: 80, // Initial score same as confidence
    lastUsed: now,
    metadata,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Increments usage for a mapping and updates its score
 */
export function incrementMappingUsage(mapping: SmartMappingSchema): SmartMappingSchema {
  const now = new Date().toISOString();
  
  // Simple score calculation that increases with usage but caps at 100
  const newScore = Math.min(100, mapping.confidence + Math.min(20, mapping.usageCount / 5));
  
  // Boost confidence to 85 if usage count is high enough
  const newConfidence = mapping.usageCount >= 2 ? 85 : mapping.confidence;
  
  return {
    ...mapping,
    usageCount: mapping.usageCount + 1,
    lastUsed: now,
    score: newScore,
    confidence: newConfidence,
    updatedAt: now
  };
}

/**
 * Mapping types used in the application
 */
export const MappingTypes = {
  PRODUCT_NAMES: 'product_names',
  EMAIL_SUPPLIER: 'email_supplier',
  EMAIL_PRODUCT: 'email_product'
}; 