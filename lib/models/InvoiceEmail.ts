import mongoose, { Schema, Document } from 'mongoose';

export interface IInvoiceEmail extends Document {
  emailId: string;
  date: Date;
  subject: string;
  from: string;
  amount: number;
  invoiceNumber?: string;
  body: string;
  status: 'pending' | 'processed' | 'ignored';
  processedAt?: Date;
  transactionId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceEmailSchema = new Schema<IInvoiceEmail>({
  emailId: { type: String, required: true, unique: true },
  date: { type: Date, required: true },
  subject: { type: String, required: true },
  from: { type: String, required: true },
  amount: { type: Number, required: true },
  invoiceNumber: { type: String },
  body: { type: String, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['pending', 'processed', 'ignored'],
    default: 'pending'
  },
  processedAt: { type: Date },
  transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' }
}, {
  timestamps: true
});

// Create indexes
InvoiceEmailSchema.index({ status: 1 });
InvoiceEmailSchema.index({ emailId: 1 });
InvoiceEmailSchema.index({ date: -1 });
InvoiceEmailSchema.index({ amount: 1 });

const InvoiceEmailModel = mongoose.models.InvoiceEmail || mongoose.model<IInvoiceEmail>('InvoiceEmail', InvoiceEmailSchema);

export default InvoiceEmailModel; 