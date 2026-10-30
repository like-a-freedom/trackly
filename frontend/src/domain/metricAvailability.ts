/** Missing optional metrics are omitted; finite zero values remain meaningful. */
export const hasMetric = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);
