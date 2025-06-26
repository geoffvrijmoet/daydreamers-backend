
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
