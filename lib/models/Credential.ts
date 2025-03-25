import mongoose, { Schema, Document } from 'mongoose';
import { GmailCredentials } from '@/types';

interface ICredential extends Document {
  type: 'gmail';
  data: GmailCredentials;
  updatedAt: string;
}

const CredentialSchema = new Schema<ICredential>({
  type: { 
    type: String, 
    required: true,
    enum: ['gmail']
  },
  data: {
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiryDate: { type: Number, required: true }
  },
  updatedAt: { type: String, required: true }
}, {
  timestamps: true
});

// Create index on type field for faster lookups
CredentialSchema.index({ type: 1 }, { unique: true });

export default mongoose.models.Credential || mongoose.model<ICredential>('Credential', CredentialSchema); 