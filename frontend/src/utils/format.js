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
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Format distance from kilometers to human readable format
 * @param {number} km - Distance in kilometers
 * @returns {string} Formatted distance string
 */
export function formatDistance(km) {
  if (!km || km < 0) return '0m';

  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }

  return `${km.toFixed(1)}km`;
}
