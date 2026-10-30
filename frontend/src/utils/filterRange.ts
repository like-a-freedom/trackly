/** Format a range once, including coincident bounds, without floating tooltips. */
export const formatFilterRange = (range: readonly number[], digits: number, unit: string): string => {
  const start = (range[0] ?? 0).toFixed(digits);
  const end = (range[1] ?? 0).toFixed(digits);
  return `${start === end ? start : `${start} – ${end}`} ${unit}`;
};
