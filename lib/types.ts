export interface Transaction {
_id: string;
date: string | Date;
amount: number;
type: 'sale' | 'expense' | 'training';
source: 'manual' | 'shopify' | 'square' | 'amex';
merchant?: string;
supplier?: string;
customer?: string;
emailId?: string;
purchaseCategory?: string;
invoiceEmailId?: string; // Reference to linked invoice email
draft?: boolean; // Indicates if this is a draft transaction

// Products for sales and expenses
products?: Array<{
    productId?: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    costDiscount?: number;
}>;

// Training-specific
clientName?: string;
dogName?: string;
trainer?: string;
revenue?: number;
taxAmount?: number;
trainingAgency?: string;

createdAt?: string | Date;
updatedAt?: string | Date;
__v?: number;
}

export interface Supplier {
id: string;
name: string;
invoiceEmail?: string;
invoiceSubjectPattern?: string;
emailParsing?: EmailParsingConfig;
}

export interface EmailParsingPattern {
pattern: string;
flags?: string;
groupIndex: number;
transform?: string;
}

export interface EmailParsingConfig {
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
    /**
     * Percentage discount that should be applied to the cost of every product 
     * line on an invoice (e.g. 0.2 for a 20 % discount). This replaces the
     * older `wholesaleDiscount` field but the latter is still respected for
     * backwards-compatibility.
     */
    costDiscount?: number;
    /** @deprecated – use costDiscount */
    wholesaleDiscount?: number;
    quantityMultiple?: number;
};
contentBounds?: {
    startPattern?: EmailParsingPattern;
    endPattern?: EmailParsingPattern;
};
}
  
export interface InvoiceEmail {
_id: string;
emailId: string;
date: string;
subject: string;
from: string;
body: string;
status: string;
supplierId?: string;
supplier?: Supplier;
transactionId?: string;
createdAt: string;
updatedAt: Date;
}

// Amex alert email parsed txn
export interface AmexTransaction {
emailId: string;
date: string;
amount: number;
merchant: string;
cardLast4: string;
}

// Combined type for list items
export type ListItem = {
type: 'transaction' | 'invoice' | 'amex';
date: string | Date;
data: Transaction | InvoiceEmail | AmexTransaction;
};