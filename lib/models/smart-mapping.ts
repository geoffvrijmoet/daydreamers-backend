import mongoose, { Schema, Document, Model } from 'mongoose';
import { ObjectId } from 'mongodb';

export interface ISmartMapping extends Document {
  _id: ObjectId; 
  mappingType: string;
  source: string;
  target: string;
  targetId?: string;
  confidence: number;
  usageCount: number;
  score?: number;
  lastUsed: Date; // Use native Date type for Mongoose
  metadata?: Record<string, unknown>;
  createdAt: Date; // These will be managed by Mongoose timestamps
  updatedAt: Date; //

  // Declare our custom instance method
  incrementUsage(): Promise<this>;
}

// 2. Define the Mongoose Schema that corresponds to the interface.
const SmartMappingSchema: Schema<ISmartMapping> = new Schema(
  {
    mappingType: { type: String, required: true },
    source: { type: String, required: true, index: true }, // Added index for faster queries
    target: { type: String, required: true },
    targetId: { type: String },
    confidence: { type: Number, default: 80 },
    usageCount: { type: Number, default: 0 },
    score: { type: Number, default: 80 },
    lastUsed: { type: Date, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    // Mongoose's timestamp option automatically adds and manages
    // `createdAt` and `updatedAt` fields of type Date.
    timestamps: true,
  }
);

// 3. Add your business logic as a custom method on the schema.
// This is the Mongoose version of your `incrementMappingUsage` helper function.
// It will be available on every document instance (e.g., `mapping.incrementUsage()`).
SmartMappingSchema.methods.incrementUsage = async function (this: ISmartMapping): Promise<ISmartMapping> {
  this.usageCount += 1;
  this.lastUsed = new Date();

  // Simple score calculation that increases with usage but caps at 100
  this.score = Math.min(100, this.confidence + Math.min(20, this.usageCount / 5));

  // Boost confidence to 85 if usage count is high enough
  if (this.usageCount >= 2) {
    this.confidence = 85;
  }
  
  // Save the changes to the database
  return this.save();
};

// 4. Create and export the Mongoose Model.
// The `mongoose.models.SmartMapping` check prevents Mongoose from compiling
// the model more than once, which is a common issue in Next.js.
const SmartMapping: Model<ISmartMapping> =
  mongoose.models.SmartMapping || mongoose.model<ISmartMapping>('SmartMapping', SmartMappingSchema, 'smart_mappings');
  // The third argument 'smart_mappings' explicitly tells Mongoose the collection name.

export default SmartMapping;


// Note: Your `createSmartMapping` helper is no longer necessary.
// The new way to create a document is simply:
// const newMapping = new SmartMapping({ mappingType, source, target, ... });
// await newMapping.save();

/**
 * Mapping types used in the application
 */
export const MappingTypes = {
  PRODUCT_NAMES: 'product_names',
  EMAIL_SUPPLIER: 'email_supplier',
  EMAIL_PRODUCT: 'email_product'
}; 