/**
 * Format duration from seconds to human readable format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    if (minutes === 0 && remainingSeconds === 0) {
      return `${hours}h`;
    }
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Format distance from kilometers to human readable format
 * @param {number} km - Distance in kilometers
 * @param {string} unit - Unit to display ('km' or 'mi')
 * @returns {string} Formatted distance string
 */
export function formatDistance(km, unit = 'km') {
  if (!km || km < 0) return '0m';

  if (unit === 'mi') {
    const miles = km * 0.621371;
    // Use rounding to handle floating point precision issues
    const roundedMiles = Math.round(miles * 100000) / 100000;
    if (roundedMiles < 1) {
      return `${Math.round(roundedMiles * 1000)}m`;
    }
    return `${miles.toFixed(2)} mi`;
  }

  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }

  return `${km.toFixed(2)} km`;
}

/**
 * Convert URLs in text to HTML links
 * @param {string} text - Text that may contain URLs
 * @returns {string} Text with URLs converted to HTML links
 */
export function convertUrlsToLinks(text) {
  if (!text) return text;

  // Regular expression to match URLs
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

  return text.replace(urlRegex, (url) => {
    // Add protocol if missing (for www. links)
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;

    // URL-encode the href for security (handles special characters properly)
    const encodedUrl = encodeURI(fullUrl);

    // Also escape the visible text for security
    const escapedVisibleText = url.replace(/[<>&"']/g, (char) => {
      const entityMap = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return entityMap[char];
    });

    // Return as HTML link with target="_blank" for security
    return `<a href="${encodedUrl}" target="_blank" rel="noopener noreferrer">${escapedVisibleText}</a>`;
  });
}
