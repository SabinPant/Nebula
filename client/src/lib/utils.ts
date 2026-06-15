/**
 * Shared Utility Functions
 *
 * Pure utility functions used across the frontend.
 * No React hooks, no API calls, no business logic.
 */

/**
 * Formats an integer paise value to a display string in Indian/Nepal numbering format.
 * @param paise - Amount in paise (integer)
 * @returns Formatted string like "Rs. 50,000.00"
 */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `Rs. ${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}