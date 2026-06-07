/**
 * Currency Utility Functions
 *
 * All monetary values are stored as integer paise in the database and
 * passed as integer paise throughout the server. Floating-point arithmetic
 * causes rounding errors on financial data — never use floats for money.
 *
 * Conversion to Rs. happens ONLY at the display layer (frontend).
 * These utilities provide safe conversion functions for boundary points
 * where the server must format values for API responses or validate user input.
 *
 * Rule: If you see `price / 100` or `amount * 100` anywhere outside this file,
 * it's wrong. All money math stays in paise. Display formatting uses these functions.
 */

/** Number of paise in one Rupee */
const PAISE_PER_RUPEE = 100;

/**
 * Converts a Rupee value (decimal) to paise (integer).
 * Rounds to nearest integer to avoid floating-point precision issues.
 *
 * @example rupeesToPaise(1320.50) → 132050
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

/**
 * Converts paise (integer) to a Rupee string for display.
 * Always returns 2 decimal places.
 *
 * @example paiseToDisplay(132050) → "1,320.50"
 */
export function paiseToDisplay(paise: number): string {
  const rupees = paise / PAISE_PER_RUPEE;
  return rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Converts paise (integer) to a Rupee number for API responses.
 * Only used when the frontend expects a numeric rupees value.
 * Prefer paiseToDisplay() for display purposes.
 *
 * @example paiseToRupees(132050) → 1320.5
 */
export function paiseToRupees(paise: number): number {
  return Math.round(paise) / PAISE_PER_RUPEE;
}

/**
 * Validates that a value is a safe integer paise amount.
 * Negative values are valid (represent debits).
 * Returns true if the value can safely represent money.
 */
export function isValidPaise(value: number): boolean {
  return Number.isSafeInteger(value);
}

/**
 * Formats a paise amount with currency symbol for display.
 *
 * @example formatCurrency(5000000) → "Rs. 50,000.00"
 */
export function formatCurrency(paise: number): string {
  return `Rs. ${paiseToDisplay(paise)}`;
}