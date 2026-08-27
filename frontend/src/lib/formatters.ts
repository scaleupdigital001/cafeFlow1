/**
 * Standardized Currency Formatter
 * @param amount Number to format as INR currency string
 * @returns Formatted currency string e.g. "Rs. 350.00"
 */
export const formatCurrency = (amount: number | null | undefined): string => {
  const numericAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `Rs. ${numericAmount.toFixed(2)}`;
};

/**
 * Standardized Date Formatter
 * @param dateStr ISO date string or Date object
 * @returns Formatted date and time string
 */
export const formatDateTime = (dateStr: string | Date | null | undefined): string => {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(dateStr);
  }
};
