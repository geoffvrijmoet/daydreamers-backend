
### Viva Raw Inventory Management System

-   **Implemented Automatic Inventory Management for Viva Raw Products**
    -   Created inventory management utility functions to automatically adjust stock levels when transactions are created, updated, or deleted.
    -   For new transactions: reduces stock by the quantity sold for Viva Raw products.
    -   For existing transactions: calculates quantity differences and adjusts stock accordingly (handles increases, decreases, and product removals).
    -   For deleted transactions: restores stock by adding back the quantities that were sold.
    -   Integrated inventory management into all transaction routes: `/api/transactions` (POST), `/api/transactions/[id]` (PUT/PATCH/DELETE).
    -   Added inventory management to Square and Shopify sync routes to handle platform-synced transactions.
    -   Prevents negative stock levels by using Math.max(0, stock - quantity).
    -   Provides detailed logging and error handling for inventory updates.
    -   Returns inventory update results in API responses for tracking purposes.
    -   Added type safety and validation: filters out invalid products (missing names, productIds, or zero quantities).
    -   Created compatibility layer for modal LineItem interface with optional productId field.
    -   Fixed Square sync to ensure product names are always valid strings.
    -   Files changed: `lib/utils/inventory-management.ts`, `app/api/transactions/route.ts`, `app/api/transactions/[id]/route.ts`, `app/api/transactions/sync/square/route.ts`, `app/api/transactions/sync/shopify/route.ts`.

-   **Mobile Optimization for Viva Raw Products Page**
    -   Enhanced responsive design with improved mobile-first approach using Tailwind's responsive prefixes.
    -   Optimized grid layout: 1 column on mobile, 2 on small screens, 3 on large, 4 on extra large.
    -   Improved touch interactions with larger touch targets and better visual feedback.
    -   Enhanced stock editing interface with save/cancel buttons and visual indicators.
    -   Added low stock warnings with color-coded indicators (red for out of stock, orange for low stock).
    -   Improved typography scaling with responsive text sizes (sm:text-base, etc.).
    -   Added visual category indicators with colored dots and product counts.
    -   Enhanced card design with better spacing, borders, and hover states.
    -   Improved loading and error states with responsive sizing.
    -   Added proper padding and margins for mobile screens.
    -   Files changed: `app/viva-raw/page.tsx`.

### Invoice Email to Transaction Linking
    -   Added functionality to link invoice emails to existing expense transactions for better data organization.
    -   Created bi-directional relationship between invoice emails and transactions using `transactionId` and `invoiceEmailId` fields.
    -   Added "Link to Transaction" button to invoice email cards in the transactions page.
    -   Created modal interface that displays filterable list of expense transactions for selection.
    -   Implemented API endpoints for updating both invoice emails and transactions to maintain referential integrity.
    -   Added visual indicators to show when invoice emails are linked to transactions.
    -   Fixed ObjectId conversion in transaction API to ensure proper MongoDB references.
    -   Added visual badges showing linked status on both invoice emails and transactions.
    -   Updated button text to show "Change Link" when email is already linked.
    -   Fixed UI issue where all "Link to Transaction" buttons showed "linking" state - now only the specific email being linked shows the loading state.
    -   Enhanced "Save as Correct" functionality to update existing linked transactions instead of creating new ones when an invoice email is already linked to a transaction.
    -   Added visual indicators and dropdown functionality for transactions with products - shows product count badge and expandable product list with details.
    -   Files changed: `lib/models/transaction.ts`, `lib/models/InvoiceEmail.ts`, `app/transactions/page.tsx`, `app/api/invoiceemails/[id]/route.ts`, `app/api/transactions/[id]/route.ts`.

### Transaction Processing Enhancements

-   **Enhanced Order Total Editing**
    -   Implemented manual editing of the 'Amount ($)' field in the new transaction modal.
    -   The manually entered total now drives tip or discount calculation.
    -   If manual total > calculated total: difference becomes tip (pre-tax/tax unchanged).
    -   If manual total < calculated total: difference becomes discount (pre-tax/tax recalculated based on discounted total).
    -   Files changed: `components/new-transaction-modal.tsx`.

-   **Fix Amount Field Editability for Sales**
    -   Corrected the `readOnly` condition for the 'Amount ($)' input.
    -   Field is now editable for 'sale' transactions to enable manual total adjustments.
    -   Adjusted conditional styling (`bg-gray-50`) based on corrected read-only logic.
    -   Files changed: `components/new-transaction-modal.tsx`.

-   **Corrected Tax Calculation for Tax-Inclusive Pricing**
    -   Updated sales calculation logic to correctly handle tax-inclusive retail prices.
    -   `itemsPreTaxSubtotal` and `itemsTax` are now derived by dividing the tax-inclusive item total by `(1 + TAX_RATE)`.
    -   Ensures accurate initial pre-tax/tax amounts for subsequent tip/discount logic.
    -   Files changed: `components/new-transaction-modal.tsx`.

-   **Verification of preTaxAmount and taxAmount in Manual Sales**
    -   Confirmed `preTaxAmount` and `taxAmount` are calculated and saved for manual sales via the `/api/transactions` endpoint.
    -   Calculation accounts for tax-inclusive prices, shipping, and discounts. Tips do not alter `preTaxAmount` or `taxAmount`.
    -   Files changed: `components/new-transaction-modal.tsx`, `app/api/transactions/route.ts`.

-   **Added Console Logging for preTaxAmount and taxAmount Verification**
    -   Added logging in `handleSubmit` to show `preTaxAmount`, `taxAmount`, and payload before API call.
    -   Added logging for API response status/data.
    -   Added logging in the server `POST` handler to show request body, and specific fields for `type: 'sale'`.
    -   Refactored server `POST` handler for clearer transaction type handling.
    -   Files changed: `components/new-transaction-modal.tsx`, `app/api/transactions/route.ts`.

### Profit Calculation System

-   **Implemented Hybrid Profit Calculation System**
    -   Adopted a hybrid approach: calculate on-the-fly based on current product costs, but store a snapshot in the database.
    -   Added `profitCalculation` field to the `SaleTransaction` schema.
    -   Created `/api/transactions/[id]/profit` API endpoint (GET/POST) for calculation and persistence.
    -   Calculation fetches current `averageCost` per product, computes costs/profits, considers fees.
    -   Added profit display to sale transaction cards (amount, margin, warning, timestamp).
    -   Implemented "Refresh profit" button to trigger recalculation/update.
    -   Files changed: `lib/models/transaction.ts`, `app/api/transactions/[id]/profit/route.ts`, `components/transactions-modal.tsx`.

-   **Fixed TypeScript Type Errors in Profit Calculation Route**
    -   Resolved type errors related to Mongoose `lean()` method results.
    -   Implemented `isSaleTransaction` type guard.
    -   Switched to `findById()` for clarity.
    -   Imported `ISaleTransaction` type.
    -   Added null checks for product properties.
    -   Files changed: `app/api/transactions/[id]/profit/route.ts`.

-   **Improved TypeScript Type Safety for Mongoose Integration**
    -   Addressed complex Mongoose `lean()` typing issues with targeted assertions (`as unknown as`).
    -   Refined sale transaction type guard.
    -   Separated data fetching and type assertion.
    -   Simplified MongoDB document handling with built-in types.
    -   Files changed: `app/api/transactions/[id]/profit/route.ts`.

-   **Fixed Runtime Error in Profit Calculation Display**
    -   Added robust null-checking in the transaction modal display.
    -   Improved property access safety for `profitMargin`, `totalProfit`, `hasCostData`, `lastCalculatedAt`.
    -   Ensures UI gracefully handles incomplete/missing profit data.
    -   Files changed: `components/transactions-modal.tsx`.

-   **Fixed Profit Calculation with String Product IDs**
    -   Modified the profit calculation API to handle product IDs stored as strings or ObjectIds.
    -   Added safe conversion from string IDs to ObjectIds before database lookup.
    -   Implemented error handling for invalid ID formats.
    -   Added detailed logging for lookup/processing steps.
    -   Ensures accurate calculations regardless of ID storage format.
    -   Files changed: `app/api/transactions/[id]/profit/route.ts`.

-   **Enhanced Debugging for Zero Profit Calculations**
    -   Added comprehensive logging throughout the profit calculation function.
    -   Logs track transaction products, ID extraction/conversion, DB queries, product mapping, individual product processing, and final results.
    -   Aids in diagnosing causes of zero or incorrect profit calculations.
    -   Files changed: `app/api/transactions/[id]/profit/route.ts`.

-   **Fixed Profit Calculation Save Issues in Next.js API Route**
    -   Resolved issue preventing profit calculations from saving (`Route "/api/transactions/[id]/profit" used params.id. params should be awaited...`).
    -   Correctly extracted transaction ID from route parameters in GET/POST handlers.
    -   Added logging before saving data.
    -   Improved error handling.
    -   Ensures calculated data is persisted.
    -   Files changed: `app/api/transactions/[id]/profit/route.ts`.

-   **Improved Profit Calculation User Experience**
    -   Fixed Next.js dynamic route parameters access using `context.params`.
    -   Replaced alert dialogs with inline success/error messages on transaction cards.
    -   Implemented automatic dismissal of messages after 3 seconds.
    -   Added subtle fade-in animation for status messages.
    -   Added logging before saving.
    -   Provides immediate, non-intrusive visual feedback.
    -   Files changed: `app/api/transactions/[id]/profit/route.ts`, `components/transactions-modal.tsx`.

-   **Completely Rebuilt Profit Calculation API for Next.js Compatibility**
    -   Refactored the profit calculation API to work around Next.js App Router dynamic route issues.
    -   Implemented manual URL path parsing to extract the transaction ID.
    -   Updated database update logic to use `findByIdAndUpdate`.
    -   Improved response format with explicit status and better error handling.
    -   Updated client-side handling for the new response format.
    -   Added robust type assertions.
    -   Files changed: `app/api/transactions/[id]/profit/route.ts`, `components/transactions-modal.tsx`.

-   **Fixed Profit Calculation Database Saving Issue**
    -   Resolved the issue where calculations worked but showed zeros due to improper database saving.
    -   Made critical changes to the API save logic:
        -   Replaced `...profitData` spread with explicit field assignments.
        -   Switched from Mongoose `findByIdAndUpdate` to direct MongoDB Collection API to avoid schema validation issues.
        -   Added detection of failed updates via `modifiedCount`.
        -   Response now sends calculated data, not the potentially stale retrieved document.
        -   Refined type assertions for Mongoose lean documents.
    -   Ensures calculated values are correctly saved and displayed.
    -   Files changed: `app/api/transactions/[id]/profit/route.ts`.

### UI and Navigation

-   **UI Enhancements: Products Page Navigation and Homepage Card**
    -   **Products Page:** Added "&larr; Back to Dashboard" button using `<Link>` to `/app/dashboard`.
    -   **Homepage:** Added a new "Products" card (linking to `/app/products`, using `Package` icon).
    -   Both cards are now in a 2-column grid layout.
    -   Files changed: `app/products/page.tsx`, `app/page.tsx`.

-   **Added Navigation Button to Transactions Modal**
    -   Included a "View All" button in the modal header next to the title.
    -   Button closes the modal and navigates to the full transactions page (`/app/transactions`).
    -   Maintains existing header layout.
    -   Files changed: `components/transactions-modal.tsx`.

-   **Enhanced Transaction Display with Profit Summaries and Payment Method Indicators**
    -   Updated the transaction modal display:
        -   Added daily profit totals and margin percentages in the summary section (styled green/red).
        -   Profit summary shown only when data exists for the day.
        -   Added payment source badges on each card (Square, Shopify, Venmo, Cash, Manual).
    -   Provides enhanced at-a-glance financial info and payment context.
    -   Files changed: `components/transactions-modal.tsx`.

-   **Expense Modal UI: Centered Prominent Amount Input**
    -   When creating an *Expense* transaction, the `Amount` field now renders as a large, border-less input centred horizontally in its own row.
    -   The original amount input inside the common fields row is hidden in expense view to prevent duplication.
    -   Styling: `text-4xl md:text-5xl`, `border-none`, `bg-transparent`, `text-center`.
    -   Reads/writes the same `formData.amount` state and keeps existing read-only behaviour when products are populated.
    -   Files changed: `components/new-transaction-modal.tsx`.

### Email Parsing System

-   **Implemented Email Parsing Feature**
    -   Initial implementation of a pattern-training system to extract structured data from invoice emails.
    -   Workflow: Click "Parse Email", select data type (orderNumber, total, subtotal, shipping, tax, discount, products), highlight text, click "Create Pattern".
    -   "Create Pattern" generates regex based on selected text and data type, including context.
    -   Patterns are saved to the supplier's `emailParsing` configuration.
    -   Saved patterns are automatically applied to emails from that supplier.
    -   Extracted values are highlighted in the email body.
    -   Includes basic handling for product parsing (name, quantity, total patterns).
    -   Processes emails in real-time based on config changes, storing results in `parsingResults`.
    -   Files involved: `app/transactions/page.tsx` (UI, workflow, state), Supplier model (schema for `emailParsing`).

-   **Made Average Cost Editable on Product Detail Page**
    -   Enabled manual editing of the "Average Cost" field for product variants.
    -   Uses an `EditableValue` component for consistent inline editing UX.
    -   Supports save/cancel functionality and currency formatting.
    -   Allows manual adjustment of cost data for profit calculation accuracy.
    -   Files changed: `app/products/[id]/page.tsx`.

-   **Enhanced Products Parsing with Multiple Examples Support**
    -   Refactored products parsing to support multiple training examples per pattern type (name, quantity, total).
    -   New workflow: Select pattern type then highlight, OR highlight then select pattern type.
    -   Allows adding multiple examples for robust training datasets.
    -   Visual feedback: buttons show example counts, examples listed with remove buttons, dynamic instructions.
    -   Smart pattern generation: simple regex for single examples, common pattern analysis (alternation, prefix/suffix) for multiple examples.
    -   Enhanced state management using arrays of examples.
    -   Improved UX with color coding, one-click removal, auto-clearing selections.
    -   Files changed: `app/transactions/page.tsx`, Supplier model (schema for `emailParsing` examples arrays).

-   **Fixed Example Deduplication to Allow Context-Based Duplicates**
    -   Removed duplicate checking logic (`.includes()`) from example handling.
    -   Previously prevented adding the same text from different contexts (e.g., "3" from "Quantity: 3" and "3 units").
    -   Fix allows adding the same literal value multiple times if context differs, leading to context-aware patterns.
    -   Files changed: `app/transactions/page.tsx`.

-   **Added Quantity Multiple Support to Email Parsing System**
    -   Added a "Quantity Multiple" input for product parsing configurations.
    -   Handles scenarios where supplier units differ from inventory units (e.g., buying packs).
    -   `quantityMultiple` field added to state, Supplier model schema, and saved in `emailParsing.products`.
    -   `extractProductsFromEmail` function now applies the quantity multiple during automatic parsing.
    -   Input supports decimal values, defaults to 1.
    -   Files changed: `app/transactions/page.tsx`, `lib/models/Supplier.ts`.

-   **Added Transaction Filtering to Transactions Page**
    -   Implemented filtering functionality for the transactions page.
    -   Filter options: All, Sales, Expenses, Invoice Emails.
    -   `activeFilter` state controls which items are displayed.
    -   Filter buttons show real-time counts for each category.
    -   UI highlights the active filter.
    -   Allows users to focus on specific data types.
    -   Files changed: `app/transactions/page.tsx`.

-   **Enhanced Automatic Email Parsing to Include Products**
    -   Updated the automatic email parsing logic to include products parsing when product patterns are configured.
    -   Calls `extractProductsFromEmail()` automatically for suppliers with product patterns.
    -   Products parsed using configured quantity multiple and wholesale discount.
    -   Products display added to email header badges ("Products: X items").
    -   Completes the automatic parsing system for comprehensive invoice data extraction.
    -   Files changed: `app/transactions/page.tsx`.

-   **Fixed Pattern Generation for Complex HTML Email Structures**
    -   Improved pattern generation to handle line breaks and whitespace in complex HTML.
    -   Addressed issue where patterns were too general due to highlighting only values, not context.
    -   Enhanced total pattern generation to capture surrounding text.
    -   Intelligent whitespace handling (`\s*`).
    -   Improved `findCommonPattern` for whitespace variations.
    -   Guidance added to highlight full context for quantities/totals (e.g., "Quantity: 3", "Total: $42.00").
    -   Generates more precise, context-aware patterns.
    -   Files changed: `app/transactions/page.tsx`.

-   **Added Pattern Retraining Interface for Existing Suppliers**
    -   Enhanced the products parsing UI for suppliers with existing patterns.
    -   Previously, users couldn't see or modify existing patterns.
    -   New features:
        -   "Current Patterns" display showing existing regex patterns.
        -   Dynamic button text ("Update Product Patterns").
        -   Clear guidance for retraining by adding new examples.
        -   "Clear Existing Patterns & Start Over" button with confirmation.
    -   Provides visibility and tools to fix/update existing patterns.
    -   Files changed: `app/transactions/page.tsx`.

-   **Added Settings-Only Update for Quantity Multiple and Wholesale Discount**
    -   Added a "Current Settings" section within the patterns display.
    -   Includes editable inputs for "Wholesale Discount" and "Quantity Multiple".
    -   "Update Settings Only" button allows saving these values independently of regex patterns.
    -   Provides granular control for quick adjustments without full retraining.
    -   Files changed: `app/transactions/page.tsx`.

-   **Added AI Parsing Integration with OpenAI (Iter 2 – training memory)**
    -   Added supplier-level `aiTraining.samples` array in the `Supplier` schema for few-shot examples.
    -   New API route `app/api/suppliers/[id]/ai-training/route.ts` saves a `{prompt,result}` pair, trimming to `maxSamples` (default 10).
    -   `lib/services/ai-email-parser.ts` now accepts examples and prepends them to the prompt.
    -   `/api/ai/parse-invoice` pulls samples for the supplier and feeds them to the parser.
    -   Front-end: `Parse with AI` now sends `supplierId`; "Save as Correct" button saves a confirmed parse as a training sample.
    -   Updated deps back to `openai`.
    -   Files changed: `lib/models/Supplier.ts`, `app/api/suppliers/[id]/ai-training/route.ts`, `lib/services/ai-email-parser.ts`, `app/api/ai/parse-invoice/route.ts`, `app/transactions/page.tsx`, `package.json`.

### AI Email Parser Prompt Refactor (Recent)

-   **Converted few-shot examples to proper chat format**
    -   Each saved sample is now a `(user=email, assistant=JSON)` pair instead of inline text.
    -   Moved JSON schema into the `system` prompt; removed boiler-plate from the user message.
    -   Cuts token usage and lets the model actually learn from previous answers.
    -   No change to `max_tokens` (still 512).
    -   File changed: `lib/services/ai-email-parser.ts`

### Invoice Email AI Parsing Improvements (Recent)

-   **Switched `productId` to Native ObjectId in Expense Products**
    -   Added `productId` (ObjectId) to `EmailProductSchema` in `lib/models/transaction.ts`.
    -   Cast incoming `productId` strings to `mongoose.Types.ObjectId` in `/api/transactions` POST handler.
    -   Updated TypeScript interfaces accordingly.
    -   Ensures proper relations for downstream aggregations.

-   **Replaced `merchant` with `supplier` on Expense Transactions**
    -   Added `supplier` field to `IExpenseTransaction` & schema; removed hard-coded `merchant` usage.
    -   API now persists `supplier` from front-end payload.
    -   Aligns DB schema with invoice-driven terminology.

-   **Increased Supplier AI-Training Prompt Size**
    -   Front-end now sends up to 6 KB of the invoice body (`email.body.slice(0, 6000)`), doubling previous context window.

-   **Alias & Training Reliability Fixes**
    -   `productId` is now saved as ObjectId, allowing `/api/products/[id]/alias` to work correctly.
    -   Fixed destructuring bug in `/api/transactions` that ignored `purchaseCategory`.

    Files changed:
    - `lib/models/transaction.ts`
    - `app/api/transactions/route.ts`
    - `app/transactions/page.tsx`

### OpenAI → Gemini Fallback (Recent)

-   When OpenAI replies with an *insufficient credit* style error the service now retries with Gemini-Pro.
    -   Implemented `parseWithGemini` using `@google/generative-ai`.
    -   Added helper `isQuotaError` to detect quota/billing messages.
    -   Lazy-initialises Gemini client with `process.env.GEMINI_API_KEY`.
    -   No change to OpenAI token budget.
    -   File changed: `lib/services/ai-email-parser.ts`

### Enhanced Processing Fee Accuracy in Sync Operations

-   **Two-Phase Sync with Actual API Fees**
    -   Enhanced both Square and Shopify sync endpoints to use actual processing fees instead of estimates.
    -   Phase 1: Creates/updates transactions with estimated fees for speed.
    -   Phase 2: Fetches actual fees from platform APIs for accuracy.
    -   Square sync calls `/api/transactions/[id]/square-fees` to get actual fees from Square Payments API.
    -   Shopify sync calls `/api/transactions/[id]/shopify-fees` to get actual fees from Shopify GraphQL API.
    -   Added fee update tracking in sync results (`feesUpdated`, `feesSkipped`).
    -   Files changed: `app/api/transactions/sync/square/route.ts`, `app/api/transactions/sync/shopify/route.ts`.

-   **Updated Home Sync Button for Enhanced Results**
    -   Modified sync button to display fee update results alongside transaction sync results.
    -   Shows number of fees updated with actual API data in blue text.
    -   Enhanced TypeScript types to include optional fee tracking fields.
    -   Files changed: `components/home-sync-button.tsx`.

-   **Fixed Square Product Name Resolution**
    -   Resolved validation error where Square line items had undefined `name` fields.
    -   Added robust fallback logic for product name resolution:
        1. Uses `item.name` if available
        2. Falls back to Square Catalog API lookup for item and variation names
        3. Uses existing MongoDB product name if found
        4. Provides descriptive fallback name as last resort
    -   Enhanced error handling with detailed logging for debugging name resolution.
    -   Applied fix to both sync endpoint and webhook handler for consistency.
    -   Files changed: `app/api/transactions/sync/square/route.ts`, `app/api/webhooks/square/route.ts`.

### Mobile UI Improvements for Transactions Modal

-   **Enhanced Mobile Layout for Transactions Modal**
    -   Moved "View All" button below the Transactions header instead of alongside it to prevent horizontal scrolling.
    -   Added responsive width classes (`w-full sm:w-auto`) for better mobile experience.
    -   Improved header layout with vertical stacking on mobile devices.
    -   Files changed: `components/transactions-modal.tsx`.

-   **Redesigned Sync Button for Mobile-First UX**
    -   Completely redesigned HomeSyncButton with mobile-friendly vertical layout.
    -   Removed horizontal dropdown popover that caused mobile scrolling issues.
    -   Added smart "days since last sync" display (e.g., "5 days" button shows time since last sync).
    -   Implemented preset sync options: Today, Last 3 days, Last 7 days, Last 30 days.
    -   Added custom date range option with date-only inputs (automatically sets Eastern time boundaries).
    -   Custom dates set to 12:00 AM start and 11:59 PM end in Eastern timezone.
    -   Enhanced date calculation using `date-fns` for accurate day differences.
    -   Files changed: `components/home-sync-button.tsx`.

### Combined Invoice Email + Transaction Super Cards (Latest)

-   **Implemented Unified Super Card Component**
    -   Created `TransactionSuperCard` component that combines transaction and invoice email data in a single, enhanced card.
    -   Features gradient background with purple/blue/indigo color scheme and glowing border effects on hover.
    -   Displays both transaction and invoice email information with clear visual separation and badges.
    -   Maintains all existing functionality: AI parsing, manual parsing, linking, product display, email body viewing.
    -   Enhanced styling includes backdrop blur effects, rounded corners, and smooth transitions.
    -   Shows extracted data prominently with color-coded badges for different field types.
    -   Responsive design with proper mobile/desktop layout considerations.
    -   Files changed: `components/transaction-super-card.tsx`, `app/transactions/page.tsx`.

-   **Enhanced Transaction Page Rendering Logic**
    -   Modified transactions page to automatically detect when a transaction has a linked invoice email.
    -   Renders the super card instead of separate transaction and invoice email cards for linked items.
    -   Maintains backward compatibility - unlinked transactions and emails still render as separate cards.
    -   Seamless integration with existing filtering, parsing, and management functionality.
    -   Files changed: `app/transactions/page.tsx`.

-   **Added Email Context Display for Parsed Products**
    -   Enhanced the `ParsedProduct` interface to include `emailContext` field for storing surrounding text.
    -   Modified `extractProductsFromEmail` function to capture 50 characters before and after each product name match.
    -   Added new "Email Context" column to the parsed products table showing where each product was found in the email.
    -   Context is displayed in a monospace font with gray background for easy reading.
    -   Added fallback display for products without context (shows "No context").
    -   Updated AI parsing to include basic context information for AI-parsed products.
    -   Files changed: `app/transactions/page.tsx`.

## 🎯 Current To-Do Items / Questions for AI

-   **Fix Linter Errors in Email Context Feature**
-   **Fix syntax errors in transactions page** - There are persistent TypeScript syntax errors in the email checking functionality that need to be resolved
    -   There are TypeScript linter errors in the `extractProductsFromEmail` function after adding email context capture
    -   Need to resolve syntax issues around lines 1124-1137 in `app/transactions/page.tsx`
    -   The email context feature is implemented but needs syntax fixes to compile properly

## ✅ Recently Completed Tasks

-   **Added Customer Assignment Feature to Transactions Modal**
    -   Implemented customer assignment functionality in the transactions modal component
    -   Added "Add Customer" button for sales transactions without customers
    -   Added "Change Customer" button for sales transactions with existing customers
    -   Created customer search modal with real-time search functionality
    -   Integrated with existing customer search API endpoint
    -   Added proper loading states and success/error feedback
    -   Customer assignment updates both local state and database via PATCH API
    -   Maintains existing transaction modal functionality while adding customer management
    -   Files changed: `components/transactions-modal.tsx`

-   **Fixed Product Model Import in Square Sync Route**
    -   Resolved "MissingSchemaError: Schema hasn't been registered for model 'Product'" error in Square sync
    -   Added missing `ProductModel` import to `/api/transactions/sync/square/route.ts`
    -   Replaced `mongoose.model('Product')` calls with proper `ProductModel` import
    -   Ensures Product model is properly registered with Mongoose before use
    -   Files changed: `app/api/transactions/sync/square/route.ts`

-   **Completely Redesigned Product List with Card-Based Layout**
    -   Replaced the old dropdown-based product list with a modern card-based grid layout
    -   Products are now grouped by `baseProductName` with one card per product group
    -   Each card shows the product name, variant count, total stock, total value, and average price
    -   Cards are clickable to expand/collapse and show individual variants
    -   Added visual indicators for low stock (amber triangle) and hidden products (gray badge)
    -   Variants are displayed in a clean, organized layout when expanded
    -   Quick edit functionality for stock and price directly on variant cards
    -   Cost and profit analysis shown for each variant
    -   Responsive grid layout (1 column on mobile, 2 on tablet, 3 on desktop)
    -   Enhanced empty state with icon and helpful messaging
    -   Files changed: `components/product-list.tsx`

-   **Enabled Draft Transaction Display on Transactions Page**
    -   Removed the draft transaction filter from the `/api/transactions` GET route
    -   Draft transactions now appear on the transactions page with a clear "📝 Draft" badge
    -   The transactions page already had the UI components to display draft status properly
    -   This allows users to see and manage draft transactions alongside finalized ones
    -   Files changed: `app/api/transactions/route.ts`

-   **Enhanced Email Checking System with Manual Timeframe Override**
    -   Modified the cron job endpoint to completely override sync state when `sinceDays` parameter is provided
    -   When manual timeframe is selected (e.g., "Last 7 days"), the system now looks back exactly that number of days regardless of last sync time
    -   When no manual timeframe is provided, the system falls back to automatic sync behavior using last sync time or default 7-day lookback
    -   Added detailed logging to distinguish between manual timeframe and automatic sync modes
    -   This ensures that manual timeframe selections always provide the expected date range coverage
    -   Files changed: `app/api/cron/check-emails/route.ts`

-   **Unified Email Checking System**
    -   Modified the cron job endpoint (`/api/cron/check-emails`) to accept a `sinceDays` parameter for manual triggering
    -   Updated the endpoint to allow both cron requests (with auth header) and manual requests (without auth header)
    -   Modified both `processSupplierEmails` and `processAmexEmails` functions to use the `sinceDays` parameter instead of hardcoded 7-day lookback
    -   Replaced the "Find Amex Transactions" button with a "Check Emails" button that triggers the unified cron job
    -   Updated the frontend to call the cron job endpoint instead of the separate Amex endpoint
    -   Enhanced the response handling to process both Amex transactions and invoice emails from a single API call
    -   Updated feedback messages to show counts for both Amex transactions and invoice emails
    -   Files changed: `app/api/cron/check-emails/route.ts`, `app/transactions/page.tsx`

-   **Implemented Amex Email Checking in Cron Job**
    -   Extended the check-emails cron job to automatically process Amex purchase notification emails
    -   Added `'gmail-amex'` source type to SyncState model for tracking Amex email sync state separately
    -   Implemented Amex email parsing that extracts purchase amount, merchant name, and card details
    -   Creates draft expense transactions (`type: 'expense'`, `source: 'amex'`, `draft: true`) from parsed Amex emails
    -   Maintains separate sync tracking for supplier invoices (`gmail`) and Amex emails (`gmail-amex`)
    -   Prevents duplicate processing by checking for existing transactions with matching `emailId`
    -   Enhanced cron job response to include separate counts for supplier emails and Amex transactions
    -   Files changed: `lib/models/SyncState.ts`, `app/api/cron/check-emails/route.ts`

-   **Enhanced Transaction Display for Draft Transactions**
    -   Added `draft` field to Transaction interfaces in both main transactions page and TransactionSuperCard component
    -   Added visual indicators for draft transactions with yellow "📝 Draft" badges
    -   Added special purple "💳 Amex" badges for Amex-sourced transactions to distinguish them from other drafts
    -   Draft transactions now display prominently with clear visual indicators in both regular transaction cards and super cards
    -   Ensures users can easily identify which transactions are drafts (including Amex email imports) vs finalized transactions
    -   Files changed: `app/transactions/page.tsx`, `components/transaction-super-card.tsx`

-   **Enhanced Invoice Email Linking with Potential Matches**
    -   Added intelligent potential match detection when linking invoice emails to transactions
    -   System now finds expense transactions within ±3 days of invoice email date with exact amount match
    -   Potential matches are displayed at the top of the linking modal with green styling and "Potential Match" badges
    -   Uses parsed total amount from invoice email (if available) to find exact amount matches
    -   Added invoice email details section at top of modal showing date, amount, and supplier for quick reference
    -   Enhanced potential matches with visual indicators for exact matches (date, amount, supplier) using green highlighting and checkmarks
    -   Maintains all existing functionality while providing smart suggestions for faster linking
    -   Files changed: `app/transactions/page.tsx`

-   **Automatic Contractor Expense for Training Transactions**
    -   When a `training` transaction is created via `/api/transactions` (POST), the API automatically creates a corresponding `expense` transaction for the trainer payout.
    -   Payout amount is calculated as the non-sales-tax portion: `revenue - taxAmount` (pre-tax revenue).
    -   The created expense uses:
        -   `supplier`: the `trainer` name from the training transaction
        -   `purchaseCategory`: `Independent Contractor Payment`
        -   `notes`: includes client/dog/agency (if present) and references the related training transaction ID
        -   `date` and `source`: same as the training transaction
    -   The response includes `contractorExpenseId` when created.
    -   Files changed: `app/api/transactions/route.ts`.

-   **Copyable In-Stock Blurbs for Viva Raw Sections**
    -   Added compact “Copy blurb” buttons to Cats, Dogs, and Pure sections on the Viva Raw page.
    -   Generates customer-friendly text like: `Turkey 3 lb, Chicken 6 lb, Duck 4 lb, Rabbit 7 lb, Beef 10 lb`.
    -   Uses simplified recipe names (Turkey/Chicken/Beef/Rabbit/Duck) and sums total pounds across in-stock items.
    -   Robust parsing for names like `Viva Raw <Recipe> for <Cats|Dogs> 1 lb - Regular` and `Viva Raw Pure <Recipe> 1 lb - Regular`.
    -   Handles oz→lb conversion; rounds to whole or 0.5 lb where applicable.
    -   One-tap copy with “Copied” feedback; mobile-optimized UI.
    -   Files changed: `app/viva-raw/page.tsx`.
