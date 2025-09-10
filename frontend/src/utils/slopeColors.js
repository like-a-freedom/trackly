/**
 * Color coding for slope gradients based on steepness
 * Red gradients for uphill, green gradients for downhill
 * Harmonized with elevation graph colors (0-4% range uses same cyan as elevation)
 */

// Slope color ranges (in percentage) - harmonized with elevation graph
const SLOPE_RANGES = [
    { min: -Infinity, max: -15, color: '#006400' },   // Dark green - very steep downhill
    { min: -15, max: -8, color: '#228B22' },          // Forest green - moderate downhill  
    { min: -8, max: -4, color: '#32CD32' },           // Lime green - gentle downhill
    { min: -4, max: 0, color: '#90EE90' },            // Light green - slight downhill
    { min: 0, max: 4, color: '#4BC0C0' },             // Cyan (same as elevation graph) - gentle uphill
    { min: 4, max: 8, color: '#FFB347' },             // Light orange - moderate uphill
    { min: 8, max: 12, color: '#FF6347' },            // Tomato red - steep uphill
    { min: 12, max: 18, color: '#DC143C' },           // Crimson - very steep uphill
    { min: 18, max: Infinity, color: '#8B0000' }      // Dark red - extreme uphill
];

/**
 * Get color for a given slope percentage
 * @param {number} slopePercent - Slope in percentage
 * @returns {string} Hex color code
 */
export function getSlopeColor(slopePercent) {
    if (typeof slopePercent !== 'number' || isNaN(slopePercent)) {
        return '#808080'; // Gray for invalid/missing data
    }

    for (const range of SLOPE_RANGES) {
        if (slopePercent >= range.min && slopePercent < range.max) {
            return range.color;
        }
    }

    return '#808080'; // Default gray
}

/**
 * Get slope category name for display
 * @param {number} slopePercent - Slope in percentage
 * @returns {string} Human-readable category
 */
export function getSlopeCategory(slopePercent) {
    if (typeof slopePercent !== 'number' || isNaN(slopePercent)) {
        return 'Unknown';
    }

    if (slopePercent <= -15) return 'Very Steep Downhill';
    if (slopePercent <= -8) return 'Moderate Downhill';
    if (slopePercent <= -4) return 'Gentle Downhill';
    if (slopePercent <= 0) return 'Slight Downhill';
    if (slopePercent <= 4) return 'Gentle Uphill';
    if (slopePercent <= 8) return 'Moderate Uphill';
    if (slopePercent <= 12) return 'Steep Uphill';
    if (slopePercent <= 18) return 'Very Steep Uphill';
    return 'Extreme Uphill';
}

/**
 * Get all slope ranges for legend
 * @returns {Array} Array of slope ranges with colors
 */
export function getSlopeRanges() {
    return SLOPE_RANGES.map(range => ({
        ...range,
        label: getSlopeCategory((range.min + range.max) / 2)
    }));
}
