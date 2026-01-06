import { useState } from 'react';

/**
 * Custom hook to manage a Year–Month (YYYY-MM) value.
 * Provides:
 *   ym     → full string ("YYYY-MM")
 *   year   → numeric year
 *   month  → numeric month (1–12)
 *   setYm  → updater function
 */
export default function useYearMonth(initialYm) {
  const [ym, setYm] = useState(initialYm);

  const year = Number(ym?.slice(0, 4));
  const month = Number(ym?.slice(5, 7));

  return { ym, year, month, setYm };
}