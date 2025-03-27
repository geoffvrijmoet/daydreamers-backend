import mongoose, { Schema, Document } from 'mongoose';

export interface ISupplier extends Document {
  name: string;
  aliases: string[];
  invoiceEmail: string;
  invoiceSubjectPattern: string;
  skuPrefix: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema = new Schema<ISupplier>({
  name: { 
    type: String, 
    required: true,
    unique: true
  },
  aliases: {
    type: [String],
    default: []
  },
  invoiceEmail: {
    type: String,
    required: true
  },
  invoiceSubjectPattern: {
    type: String,
    required: true
  },
  skuPrefix: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Create indexes for common queries
SupplierSchema.index({ name: 1 }, { unique: true });
SupplierSchema.index({ aliases: 1 });
SupplierSchema.index({ skuPrefix: 1 }, { unique: true });

export default mongoose.models.Supplier || mongoose.model<ISupplier>('Supplier', SupplierSchema); 