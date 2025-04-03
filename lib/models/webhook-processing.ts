import mongoose, { Schema, Document } from 'mongoose'

export interface IWebhookProcessing extends Document {
  platform: 'shopify' | 'square'
  orderId: string
  topic: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  attemptCount: number
  lastAttempt: Date
  error?: string
  data: any
  createdAt: Date
  updatedAt: Date
}

const WebhookProcessingSchema = new Schema<IWebhookProcessing>({
  platform: { type: String, required: true, enum: ['shopify', 'square'] },
  orderId: { type: String, required: true },
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
  data: { type: Schema.Types.Mixed, required: true }
}, {
  timestamps: true
})

// Index for efficient lookups
WebhookProcessingSchema.index({ platform: 1, orderId: 1, topic: 1 }, { unique: true })
WebhookProcessingSchema.index({ status: 1, lastAttempt: 1 })

const WebhookProcessingModel = mongoose.models.WebhookProcessing || 
  mongoose.model<IWebhookProcessing>('WebhookProcessing', WebhookProcessingSchema)

export default WebhookProcessingModel 