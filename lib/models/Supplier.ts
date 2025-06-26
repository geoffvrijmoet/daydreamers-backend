import mongoose, { Schema, Document } from 'mongoose';

interface EmailParsingPattern {
  pattern: string;  // The regex pattern to match
  flags?: string;   // Optional regex flags
  groupIndex: number; // Which capture group contains the value
  transform?: string; // Optional transformation to apply (e.g., "parseFloat", "parseInt", "trim")
}

interface EmailParsingConfig {
  orderNumber?: EmailParsingPattern;
  total?: EmailParsingPattern;
  subtotal?: EmailParsingPattern;
  shipping?: EmailParsingPattern;
  tax?: EmailParsingPattern;
  discount?: EmailParsingPattern;
  products?: {
    items: {
      name: EmailParsingPattern;
      quantity: EmailParsingPattern;
      total: EmailParsingPattern;
    },
    wholesaleDiscount?: number; // Percentage as decimal (0.20 for 20%)
    quantityMultiple?: number; // Multiplier for quantities (e.g., 2.0 for double)
  };
  items?: {
    section: EmailParsingPattern;  // Pattern to identify the items section
    item: {
      name: EmailParsingPattern;
      quantity: EmailParsingPattern;
      price: EmailParsingPattern;
      variant?: EmailParsingPattern;
    };
  };
  addresses?: {
    billing: EmailParsingPattern;
    shipping: EmailParsingPattern;
  };
  contentBounds?: {
    startPattern?: EmailParsingPattern;
    endPattern?: EmailParsingPattern;
  };
}

export interface ISupplier extends Document {
  name: string;
  aliases: string[];
  invoiceEmail: string;
  invoiceSubjectPattern: string;
  skuPrefix: string;
  aiTraining?: {
    samples: {
      prompt: string;
      result: Record<string, unknown>;
    }[];
    maxSamples?: number;
  };
  emailParsing?: EmailParsingConfig;
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
  },
  aiTraining: {
    samples: [
      {
        prompt: { type: String },
        result: { type: Schema.Types.Mixed }
      }
    ],
    maxSamples: { type: Number, default: 10 }
  },
  emailParsing: {
    orderNumber: {
      pattern: { type: String },
      flags: { type: String },
      groupIndex: { type: Number },
      transform: { type: String }
    },
    total: {
      pattern: { type: String },
      flags: { type: String },
      groupIndex: { type: Number },
      transform: { type: String }
    },
    subtotal: {
      pattern: { type: String },
      flags: { type: String },
      groupIndex: { type: Number },
      transform: { type: String }
    },
    shipping: {
      pattern: { type: String },
      flags: { type: String },
      groupIndex: { type: Number },
      transform: { type: String }
    },
    tax: {
      pattern: { type: String },
      flags: { type: String },
      groupIndex: { type: Number },
      transform: { type: String }
    },
    discount: {
      pattern: { type: String },
      flags: { type: String },
      groupIndex: { type: Number },
      transform: { type: String }
    },
    products: {
      items: {
        name: {
          pattern: { type: String },
          flags: { type: String },
          groupIndex: { type: Number },
          transform: { type: String }
        },
        quantity: {
          pattern: { type: String },
          flags: { type: String },
          groupIndex: { type: Number },
          transform: { type: String }
        },
        total: {
          pattern: { type: String },
          flags: { type: String },
          groupIndex: { type: Number },
          transform: { type: String }
        }
      },
      wholesaleDiscount: { type: Number },
      quantityMultiple: { type: Number }
    },
    items: {
      section: {
        pattern: { type: String },
        flags: { type: String },
        groupIndex: { type: Number }
      },
      item: {
        name: {
          pattern: { type: String },
          flags: { type: String },
          groupIndex: { type: Number },
          transform: { type: String }
        },
        quantity: {
          pattern: { type: String },
          flags: { type: String },
          groupIndex: { type: Number },
          transform: { type: String }
        },
        price: {
          pattern: { type: String },
          flags: { type: String },
          groupIndex: { type: Number },
          transform: { type: String }
        },
        variant: {
          pattern: { type: String },
          flags: { type: String },
          groupIndex: { type: Number },
          transform: { type: String }
        }
      }
    },
    addresses: {
      billing: {
        pattern: { type: String },
        flags: { type: String },
        groupIndex: { type: Number }
      },
      shipping: {
        pattern: { type: String },
        flags: { type: String },
        groupIndex: { type: Number }
      }
    },
    contentBounds: {
      startPattern: {
        pattern: { type: String },
        flags: { type: String },
        groupIndex: { type: Number }
      },
      endPattern: {
        pattern: { type: String },
        flags: { type: String },
        groupIndex: { type: Number }
      }
    }
  }
}, {
  timestamps: true
});

// Create indexes for common queries
SupplierSchema.index({ name: 1 }, { unique: true });
SupplierSchema.index({ aliases: 1 });
SupplierSchema.index({ skuPrefix: 1 }, { unique: true });
SupplierSchema.index({ invoiceEmail: 1 });

const SupplierModel = mongoose.models.Supplier || mongoose.model<ISupplier>('Supplier', SupplierSchema);

export default SupplierModel; 