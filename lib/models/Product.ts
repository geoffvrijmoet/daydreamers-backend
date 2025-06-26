import mongoose, { Schema, Document } from 'mongoose';

export interface ICostHistory {
  date: Date;
  cost: number;
  quantity: number;
  source: 'wholesale' | 'manual' | 'square' | 'shopify';
  reference?: string; // Order number, transaction ID, etc.
}

export interface IPlatformMetadata {
  platform: 'shopify' | 'square';
  productId: string;
  variantId?: string;
  parentId?: string;
  sku?: string;
  barcode?: string;
  lastSyncedAt: Date;
  syncStatus: 'success' | 'failed' | 'pending';
  lastError?: string;
}

export interface IProduct extends Document {
  baseProductName: string;             // The main product name without variant (e.g., "Beef Flip")
  variantName: string;                 // The variant name (e.g., "8.5 oz bag", "Single")
  name: string;                        // Full product name (baseProductName + " - " + variantName)
  description?: string;
  category: string;
  sku: string;
  barcode?: string;
  price: number;
  stock: number;
  minimumStock: number;
  lastPurchasePrice: number;
  averageCost: number;
  supplier?: string;
  isProxied: boolean;
  proxyOf?: mongoose.Types.ObjectId;
  proxyRatio?: number;
  costHistory: ICostHistory[];
  totalSpent: number;
  totalPurchased: number;
  lastRestockDate?: Date;
  active: boolean;
  platformMetadata: IPlatformMetadata[];
  syncStatus: {
    lastSyncAttempt: Date;
    lastSuccessfulSync: Date;
    errors: Array<{
      date: Date;
      platform: 'shopify' | 'square';
      error: string;
    }>;
  };
  supplierAliases?: {
    supplierId: mongoose.Types.ObjectId | string;
    nameInInvoice: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const CostHistorySchema = new Schema<ICostHistory>({
  date: { type: Date, required: true },
  cost: { type: Number, required: true },
  quantity: { type: Number, required: true },
  source: { type: String, required: true, enum: ['wholesale', 'manual', 'square', 'shopify'] },
  reference: { type: String }
});

const PlatformMetadataSchema = new Schema<IPlatformMetadata>({
  platform: { type: String, required: true, enum: ['shopify', 'square'] },
  productId: { type: String, required: true },
  variantId: { type: String },
  parentId: { type: String },
  sku: { type: String },
  barcode: { type: String },
  lastSyncedAt: { type: Date, required: true },
  syncStatus: { type: String, required: true, enum: ['success', 'failed', 'pending'] },
  lastError: { type: String }
});

const ProductSchema = new Schema<IProduct>({
  baseProductName: { type: String, required: true },
  variantName: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  category: { type: String, required: true, default: '' },
  sku: { type: String, required: true, unique: true },
  barcode: { type: String },
  price: { type: Number, required: true },
  stock: { type: Number, required: true, default: 0 },
  minimumStock: { type: Number, required: true, default: 5 },
  lastPurchasePrice: { type: Number, required: true, default: 0 },
  averageCost: { type: Number, required: true, default: 0 },
  supplier: { type: String, default: '' },
  isProxied: { type: Boolean, default: false },
  proxyOf: { type: Schema.Types.ObjectId, ref: 'Product', sparse: true },
  proxyRatio: { type: Number, sparse: true },
  costHistory: [CostHistorySchema],
  totalSpent: { type: Number, required: true, default: 0 },
  totalPurchased: { type: Number, required: true, default: 0 },
  lastRestockDate: { type: Date },
  active: { type: Boolean, default: true },
  platformMetadata: [PlatformMetadataSchema],
  syncStatus: {
    lastSyncAttempt: { type: Date },
    lastSuccessfulSync: { type: Date },
    errors: [{
      date: { type: Date, required: true },
      platform: { type: String, required: true, enum: ['shopify', 'square'] },
      error: { type: String, required: true }
    }]
  },
  supplierAliases: [{
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    nameInInvoice: { type: String, required: true }
  }]
}, {
  timestamps: true
});

// Indexes for common queries
ProductSchema.index({ baseProductName: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ stock: 1 });
ProductSchema.index({ active: 1 });
ProductSchema.index({ 'platformMetadata.productId': 1 });
ProductSchema.index({ 'platformMetadata.sku': 1 });
ProductSchema.index({ 'supplierAliases.nameInInvoice': 1 });

// Pre-save hook to ensure name is always baseProductName + variantName
ProductSchema.pre('save', function(next) {
  if (this.baseProductName && this.variantName) {
    this.name = `${this.baseProductName}${this.variantName !== 'Default' ? ` - ${this.variantName}` : ''}`;
  }
  next();
});

// Virtual for profit margin
ProductSchema.virtual('profitMargin').get(function() {
  if (this.averageCost === 0) return 0;
  return ((this.price - this.averageCost) / this.price) * 100;
});

// Method to update cost history
ProductSchema.methods.updateCostHistory = async function(cost: number, quantity: number, source: 'wholesale' | 'manual' | 'square' | 'shopify', reference?: string) {
  this.costHistory.push({
    date: new Date(),
    cost,
    quantity,
    source,
    reference
  });
  
  // Update average cost
  const totalCost = this.totalSpent + (cost * quantity);
  const totalQuantity = this.totalPurchased + quantity;
  this.averageCost = totalCost / totalQuantity;
  
  // Update totals
  this.totalSpent = totalCost;
  this.totalPurchased = totalQuantity;
  this.lastPurchasePrice = cost;
  
  await this.save();
};

// Method to update platform metadata
ProductSchema.methods.updatePlatformMetadata = async function(platform: 'shopify' | 'square', metadata: Partial<IPlatformMetadata>) {
  const existingMetadata = this.platformMetadata.find((m: IPlatformMetadata) => m.platform === platform);
  if (existingMetadata) {
    Object.assign(existingMetadata, {
      ...metadata,
      lastSyncedAt: new Date()
    });
  } else {
    this.platformMetadata.push({
      platform,
      productId: metadata.productId!,
      variantId: metadata.variantId,
      parentId: metadata.parentId,
      sku: metadata.sku,
      barcode: metadata.barcode,
      lastSyncedAt: new Date(),
      syncStatus: 'success'
    });
  }
  await this.save();
};

// Method to record sync error
ProductSchema.methods.recordSyncError = async function(platform: 'shopify' | 'square', error: string) {
  this.syncStatus.lastSyncAttempt = new Date();
  this.syncStatus.errors.push({
    date: new Date(),
    platform,
    error
  });
  await this.save();
};

export default mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema); 