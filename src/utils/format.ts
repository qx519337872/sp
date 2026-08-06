import { DetectedCard } from '../types';

/**
 * Checks if a card amount represents a free gift (e.g., '058', '020', '0', '赠品').
 * Any amount starting with '0' or matching '赠品' counts towards item quantity (+1件),
 * but adds 0 to monetary total (+0元).
 */
export function isGiftAmount(amount: string | number | undefined | null): boolean {
  if (amount === undefined || amount === null || amount === '') return false;
  const str = String(amount).trim();
  // Any amount string starting with '0' (e.g. '058', '020', '0', '00') or containing '赠品' is a gift
  return str.startsWith('0') || str.includes('赠品') || str === '赠';
}

/**
 * Formats a number or numeric string with thousands separators from the right.
 * E.g., 2020 -> "2,020", 123456 -> "123,456", 220 -> "220"
 */
export function formatAmountWithCommas(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || amount === '') return '0';
  const cleanStr = String(amount).replace(/[^\d.]/g, '');
  const num = parseFloat(cleanStr);
  if (isNaN(num)) return String(amount);
  
  // Format with thousands comma separators
  return num.toLocaleString('en-US');
}

/**
 * Calculates total monetary amount for an array of cards, excluding gifts like '058'.
 */
export function calculateTotalAmount(cards: DetectedCard[]): number {
  return cards.reduce((sum, card) => {
    if (isGiftAmount(card.amount)) return sum;
    const val = parseFloat(String(card.amount));
    return sum + (!isNaN(val) && val > 0 ? val : 0);
  }, 0);
}
