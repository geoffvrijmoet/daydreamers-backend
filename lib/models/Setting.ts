import mongoose, { Schema, Document } from 'mongoose';

interface ISetting extends Document {
  key: string;
  historyId?: string;
  expiration?: string;
  updatedAt: string;
}

const SettingSchema = new Schema<ISetting>({
  key: { 
    type: String, 
    required: true,
    unique: true
  },
  historyId: { type: String },
  expiration: { type: String },
  updatedAt: { type: String, required: true }
}, {
  timestamps: true
});

// Create index on key field for faster lookups
SettingSchema.index({ key: 1 }, { unique: true });

export default mongoose.models.Setting || mongoose.model<ISetting>('Setting', SettingSchema); 