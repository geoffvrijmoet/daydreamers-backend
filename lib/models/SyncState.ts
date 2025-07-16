import mongoose, { Schema, Document } from 'mongoose';

export interface ISyncState extends Document {
  source: 'square' | 'shopify' | 'gmail' | 'gmail-amex';
  lastSuccessfulSync: string;
  lastSyncStatus: 'success' | 'failed' | 'pending';
  lastSyncResults?: {
    created: number;
    updated: number;
    skipped: number;
  };
  updatedAt: string;
}

const SyncStateSchema = new Schema<ISyncState>({
  source: { 
    type: String, 
    required: true,
    enum: ['square', 'shopify', 'gmail', 'gmail-amex'],
    unique: true
  },
  lastSuccessfulSync: {
    type: String,
    required: true
  },
  lastSyncStatus: {
    type: String,
    required: true,
    enum: ['success', 'failed', 'pending'],
    default: 'pending'
  },
  lastSyncResults: {
    created: { type: Number },
    updated: { type: Number },
    skipped: { type: Number }
  }
}, {
  timestamps: true
});

// Create index on source field for faster lookups
SyncStateSchema.index({ source: 1 }, { unique: true });

export default mongoose.models.SyncState || mongoose.model<ISyncState>('SyncState', SyncStateSchema); 