/**
 * Format duration from seconds to human readable format
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0 || isNaN(seconds)) return 'N/A';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
}

/**
 * Format distance from kilometers to human readable format
 * @param distanceKm - Distance in kilometers
 * @param unit - Unit to display ('km' or 'mi')
 * @returns Formatted distance string
 */
export function formatDistance(distanceKm: number, unit: 'km' | 'mi' = 'km'): string {
  if (typeof distanceKm !== 'number' || isNaN(distanceKm) || distanceKm < 0) {
    return 'N/A';
  }

  if (unit === 'mi') {
    return `${(distanceKm * 0.621371).toFixed(2)} mi`;
  }
  return `${distanceKm.toFixed(2)} km`;
}

/**
 * Convert URLs in text to HTML links
 * @param text - Text that may contain URLs
 * @returns Text with URLs converted to HTML links
 */
export function convertUrlsToLinks(text: string): string {
  if (!text) return text;

  // Regular expression to match URLs
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

  return text.replace(urlRegex, (url) => {
    // Add small HTML entity decoder for the URL so that entities like &lt; &gt; are
    // converted back to literal characters before percent-encoding. This ensures
    // href attributes do not contain raw HTML entities that the browser may decode
    // back into unsafe characters when parsing the attribute.
    const htmlEntityMap: Record<string, string> = {
      'lt': '<',
      'gt': '>',
      'amp': '&',
      'quot': '"',
      '#39': "'"
    };
    const decodeHtmlEntities = (s: string) => s.replace(/&(lt|gt|amp|quot|#39);/g, (_, name) => htmlEntityMap[name] || '&' + name + ';');

    // Add protocol if missing (for www. links)
    const rawUrl = url;
    const unescapedUrl = decodeHtmlEntities(rawUrl);
    const fullUrl = unescapedUrl.startsWith('http') ? unescapedUrl : `https://${unescapedUrl}`;

    // URL-encode the href for security (handles special characters properly)
    const encodedUrl = encodeURI(fullUrl);

    // Also escape the visible text for security (show escaped entities in visible text)
    const escapedVisibleText = rawUrl.replace(/[<>&"']/g, (char) => {
      const entityMap: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return entityMap[char] ?? char;
    });

    // Return as HTML link with target="_blank" for security
    return `<a href="${encodedUrl}" target="_blank" rel="noopener noreferrer">${escapedVisibleText}</a>`;
  });
}

/**
 * Format date and time string into human readable localized datetime
 * Uses the same options as the UI reference in TrackDetailPanel.vue
 * @param dateString - value to parse into Date (ISO string or Date object or unix timestamp seconds)
 * @returns formatted date/time or 'N/A'/'Invalid Date' for errors
 */
export function formatDateTime(dateString: string | Date | number): string {
  if (!dateString && dateString !== 0) return 'N/A';
  try {
    let dateObj: Date;
    if (typeof dateString === 'number') {
      // If millis or seconds? If it's > 1e11 (ms since epoch) it's probably millis, else seconds
      // We interpret > 1e11 as ms and <= 1e11 as seconds
      dateObj = dateString > 1e11 ? new Date(dateString) : new Date(dateString * 1000);
    } else {
      dateObj = new Date(dateString);
    }
    if (isNaN(dateObj.getTime())) return 'Invalid Date';

    const options: Intl.DateTimeFormatOptions = {
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

/**
 * Validate speed data
 * @param speed - Speed value
 * @returns Validated speed or null if invalid
 */
export function validateSpeedData(speed: number): number | null {
  if (typeof speed !== 'number' || isNaN(speed) || speed < 0 || speed > 200) {
    return null;
  }
  return speed;
}

/**
 * Format speed in km/h or mph
 * @param speed - Speed in km/h
 * @param unit - 'kmh' or 'mph'
 * @returns Formatted speed string
 */
export function formatSpeed(speed: number, unit: 'kmh' | 'mph' = 'kmh'): string {
  const validSpeed = validateSpeedData(speed);
  if (validSpeed === null) return 'N/A';

  if (unit === 'mph') {
    return `${(validSpeed * 0.621371).toFixed(2)} mph`;
  }
  return `${validSpeed.toFixed(2)} km/h`;
}

/**
 * Calculate pace from speed
 * @param speed - Speed in km/h
 * @param unit - 'min/km' or 'min/mi'
 * @returns Formatted pace string
 */
export function calculatePaceFromSpeed(speed: number, unit: 'min/km' | 'min/mi' = 'min/km'): string {
  const validSpeed = validateSpeedData(speed);
  if (validSpeed === null || validSpeed === 0) return 'N/A';

  let paceMinutes: number;
  if (unit === 'min/mi') {
    // Convert km/h to min/mi: 60 / (km/h * 0.621371)
    paceMinutes = 60 / (validSpeed * 0.621371);
  } else {
    // Convert km/h to min/km: 60 / km/h
    paceMinutes = 60 / validSpeed;
  }

  const minutes = Math.floor(paceMinutes);
  const seconds = Math.round((paceMinutes - minutes) * 60);

  return `${minutes}:${seconds.toString().padStart(2, '0')} ${unit}`;
}

/**
 * Convert speed to pace (alias for calculatePaceFromSpeed)
 * @param speed - Speed in km/h
 * @param unit - 'min/km' or 'min/mi'
 * @returns Formatted pace string
 */
export function speedToPace(speed: number, unit: 'min/km' | 'min/mi' = 'min/km'): string {
  return calculatePaceFromSpeed(speed, unit);
}

/**
 * Convert pace string to speed
 * @param paceString - Pace in format "5:30" or "5:30 min/km"
 * @param unit - 'min/km' or 'min/mi'
 * @returns Speed in km/h or null if invalid
 */
export function paceToSpeed(paceString: string, unit: 'min/km' | 'min/mi' = 'min/km'): number | null {
  if (!paceString || typeof paceString !== 'string') return null;

  // Parse pace like "5:30" or "5:30 min/km" - ensure match starts at beginning
  const match = paceString.match(/^(\d+):(\d+)/);
  if (!match) return null;

  const minutes = parseInt(match[1] ?? '0');
  const seconds = parseInt(match[2] ?? '0');

  if (minutes < 0 || seconds < 0 || seconds >= 60) return null;

  const totalMinutes = minutes + (seconds / 60);

  if (unit === 'min/mi') {
    // Convert min/mi to km/h: (60 / min/mi) * 1.60934
    return (60 / totalMinutes) * 1.60934;
  } else {
    // Convert min/km to km/h: 60 / min/km
    return 60 / totalMinutes;
  }
}

/**
 * Format pace in minutes per km or mile
 * @param paceMinutes - Pace in minutes
 * @param unit - 'min/km' or 'min/mi'
 * @returns Formatted pace string
 */
export function formatPace(paceMinutes: number, unit: 'min/km' | 'min/mi' = 'min/km'): string {
  if (typeof paceMinutes !== 'number' || isNaN(paceMinutes) || paceMinutes <= 0) {
    return 'N/A';
  }

  const minutes = Math.floor(paceMinutes);
  const seconds = Math.round((paceMinutes - minutes) * 60);

  return `${minutes}:${seconds.toString().padStart(2, '0')} ${unit}`;
}

/**
 * Format time value for display
 * @param timeValue - Unix timestamp or ISO string
 * @returns Formatted time string
 */
export function formatTime(timeValue: number | string): string {
  if (!timeValue && timeValue !== 0) return '';

  try {
    if (typeof timeValue === 'number') {
      return new Date(timeValue).toISOString();
    }
    return String(timeValue);
  } catch (e) {
    return String(timeValue);
  }
}
