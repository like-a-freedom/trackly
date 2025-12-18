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
    // Add small HTML entity decoder for the URL so that entities like &lt; &gt; are
    // converted back to literal characters before percent-encoding. This ensures
    // href attributes do not contain raw HTML entities that the browser may decode
    // back into unsafe characters when parsing the attribute.
    const htmlEntityMap = {
      'lt': '<',
      'gt': '>',
      'amp': '&',
      'quot': '"',
      '#39': "'"
    };
    const decodeHtmlEntities = (s) => s.replace(/&(lt|gt|amp|quot|#39);/g, (_, name) => htmlEntityMap[name] || '&' + name + ';');

    // Add protocol if missing (for www. links)
    const rawUrl = url;
    const unescapedUrl = decodeHtmlEntities(rawUrl);
    const fullUrl = unescapedUrl.startsWith('http') ? unescapedUrl : `https://${unescapedUrl}`;

    // URL-encode the href for security (handles special characters properly)
    const encodedUrl = encodeURI(fullUrl);

    // Also escape the visible text for security (show escaped entities in visible text)
    const escapedVisibleText = rawUrl.replace(/[<>&"']/g, (char) => {
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

/**
 * Format date and time string into human readable localized datetime
 * Uses the same options as the UI reference in TrackDetailPanel.vue
 * @param {string|Date|number} dateString - value to parse into Date (ISO string or Date object or unix timestamp seconds)
 * @returns {string} formatted date/time or 'N/A'/'Invalid Date' for errors
 */
export function formatDateTime(dateString) {
  if (!dateString && dateString !== 0) return 'N/A';
  try {
    let dateObj;
    if (typeof dateString === 'number') {
      // If millis or seconds? If it's > 1e11 (ms since epoch) it's probably millis, else seconds
      // We interpret > 1e11 as ms and <= 1e11 as seconds
      dateObj = dateString > 1e11 ? new Date(dateString) : new Date(dateString * 1000);
    } else {
      dateObj = new Date(dateString);
    }
    if (isNaN(dateObj.getTime())) return 'Invalid Date';

    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };

    return dateObj.toLocaleString(undefined, options);
  } catch (e) {
    console.error('Error formatting date:', dateString, e);
    return 'Invalid Date';
  }
}
