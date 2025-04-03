import mongoose, { Schema, Document } from 'mongoose';

interface IProcessedData {
  orderId?: string;
  existingTransaction?: mongoose.Types.ObjectId;
  lineItems?: Array<{
    productId?: mongoose.Types.ObjectId;
    name: string;
    quantity: number;
    price: number;
    sku: string;
    variantId?: string;
  }>;
}

export interface IWebhookProcessing extends Document {
  webhookId: string;
  platform: 'shopify' | 'square';
  topic: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attemptCount: number;
  lastAttempt: Date;
  error?: string;
  rawBody: string;
  processedData?: IProcessedData;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookProcessingSchema = new Schema<IWebhookProcessing>({
  webhookId: { type: String, required: true, unique: true },
  platform: { type: String, required: true, enum: ['shopify', 'square'] },
  topic: { type: String, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  attemptCount: { type: Number, required: true, default: 0 },
  lastAttempt: { type: Date, required: true, default: Date.now },
  error: { type: String },
  rawBody: { type: String, required: true },
  processedData: { type: Schema.Types.Mixed }
}, {
  timestamps: true,
  collection: 'webhook_processing'
});

// Index for finding failed webhooks
WebhookProcessingSchema.index({ status: 1, attemptCount: 1 });

const WebhookProcessingModel = mongoose.models.WebhookProcessing || 
  mongoose.model<IWebhookProcessing>('WebhookProcessing', WebhookProcessingSchema);

export default WebhookProcessingModel; 