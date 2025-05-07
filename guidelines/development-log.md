## Enhanced Order Total Editing in New Sale Modal

- Modified `components/new-transaction-modal.tsx` to allow manual editing of the 'Amount ($)' field to dynamically calculate tip or discount.
- If the manually entered total is higher than the sum of items and tax, the difference becomes a tip, with pre-tax and tax amounts remaining unchanged.
- If the manually entered total is lower, the difference becomes a discount. The pre-tax and tax amounts are then recalculated based on the new discounted total.
- This ensures the 'Amount ($)' field drives the calculation for tips or discounts when manually adjusted, providing more flexibility in finalizing sales transactions.

## Fix Amount Field Editability for Sales

- Corrected the `readOnly` condition for the 'Amount ($') input in `components/new-transaction-modal.tsx`.
- The field is now correctly editable for 'sale' transactions, allowing manual total adjustments to drive tip/discount calculations. It was previously erroneously locked for sales.
- Adjusted conditional styling (`bg-gray-50`) to align with the corrected `readOnly` logic.

## Corrected Tax Calculation for Tax-Inclusive Pricing

- Updated the sales calculation logic in `components/new-transaction-modal.tsx` to correctly handle tax-inclusive retail prices.
- Previously, item prices were assumed to be pre-tax. The logic now correctly derives the `itemsPreTaxSubtotal` and `itemsTax` by dividing the tax-inclusive item total by `(1 + TAX_RATE)`.
- This ensures accurate calculation of the initial pre-tax and tax amounts, which then correctly flows into the tip/discount adjustment logic.

## UI Enhancements: Products Page Navigation and Homepage Card

- **Products Page (`app/products/page.tsx`):** Added a "&larr; Back to Dashboard" button using Next.js `<Link>` for easy navigation back to `/app/dashboard`.
- **Homepage (`app/page.tsx`):** 
    - Introduced a new "Products" card next to the existing "Profit/Loss" card.
    - Both cards are now housed in a 2-column grid for better layout.
    - The "Products" card links to `/app/products` and uses the `Package` icon from `lucide-react`.

#question: we are working on a 