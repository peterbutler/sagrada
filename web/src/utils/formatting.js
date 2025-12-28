/**
 * Format time for clock display (24-hour format)
 * @param {Date} date - Date object
 * @returns {string} Formatted time string "YYYY-MM-DD HH:MM:SS"
 */
export function formatTime(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format time for clock display (time only)
 * @param {Date} date - Date object
 * @returns {string} Formatted time string "HH:MM:SS"
 */
export function formatTimeOnly(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format duration in human-readable form
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(ms) {
  if (ms < 0) ms = 0;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0
      ? `${days}d ${remainingHours}h`
      : `${days}d`;
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Format a scheduled time for display
 * @param {string} isoString - ISO 8601 datetime string
 * @returns {string} Human-readable time (e.g., "Tomorrow 7:30am")
 */
export function formatScheduledTime(isoString) {
  if (!isoString) return '';

  const date = new Date(isoString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  const timeStr = `${displayHours}:${minutes}${ampm}`;

  if (isToday) {
    return `Today ${timeStr}`;
  } else if (isTomorrow) {
    return `Tomorrow ${timeStr}`;
  } else {
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day} ${timeStr}`;
  }
}

/**
 * Format latency for display
 * @param {number|null} ms - Latency in milliseconds
 * @returns {string} Formatted latency
 */
export function formatLatency(ms) {
  if (ms === null || ms === undefined) {
    return '--ms';
  }
  return `${Math.round(ms)}ms`;
}

/**
 * Format time ago for sensor staleness display (ms counter)
 * @param {string|Date} timestamp - Last reading timestamp
 * @returns {string} Formatted time like "234ms", "1.2s", "45s", "3m", "2h", "3d", "2w"
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp) return '--';

  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return '0ms';

  // Less than 1 second: show milliseconds
  if (diffMs < 1000) {
    return `${diffMs}ms`;
  }

  // Less than 10 seconds: show seconds with 1 decimal
  if (diffMs < 10000) {
    return `${(diffMs / 1000).toFixed(1)}s`;
  }

  // Less than 60 seconds: show seconds
  if (diffMs < 60000) {
    return `${Math.floor(diffMs / 1000)}s`;
  }

  // Less than 60 minutes: show minutes
  if (diffMs < 3600000) {
    return `${Math.floor(diffMs / 60000)}m`;
  }

  // Less than 24 hours: show hours
  if (diffMs < 86400000) {
    return `${Math.floor(diffMs / 3600000)}h`;
  }

  // Less than 7 days: show days
  if (diffMs < 604800000) {
    return `${Math.floor(diffMs / 86400000)}d`;
  }

  // Otherwise show weeks
  return `${Math.floor(diffMs / 604800000)}w`;
}

/**
 * Get staleness class based on time since last reading
 * @param {string|Date} timestamp - Last reading timestamp
 * @returns {string} CSS class name
 */
export function getStalenessClass(timestamp) {
  if (!timestamp) return 'stale-unknown';

  const diffMs = Date.now() - new Date(timestamp).getTime();

  // Fresh: less than 10 seconds
  if (diffMs < 10000) return 'stale-fresh';

  // Warning: 10-60 seconds
  if (diffMs < 60000) return 'stale-warning';

  // Stale: more than 60 seconds
  return 'stale-old';
}

/**
 * Get relative time label for chart x-axis
 * @param {number} minutesAgo - Minutes before now
 * @returns {string} Label like "-60m", "-30m", "0m"
 */
export function formatChartTimeLabel(minutesAgo) {
  if (minutesAgo === 0) {
    return '0m';
  }
  return `-${minutesAgo}m`;
}
