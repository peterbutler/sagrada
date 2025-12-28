/**
 * Calculate rate of change from historical minute-averaged data
 * Compares average of recent readings vs reading from N minutes ago
 *
 * @param {Array<{timestamp: string, avg: number}>} historyData - Minute-averaged history points
 * @param {number} currentTemp - Current temperature reading
 * @param {number} compareMinutesAgo - How many minutes back to compare (default: 5)
 * @returns {number|null} Rate in °F per hour, or null if insufficient data
 */
export function calculateRateFromHistory(historyData, currentTemp, compareMinutesAgo = 5) {
  if (!historyData || historyData.length < compareMinutesAgo) {
    return null;
  }

  if (currentTemp === null || currentTemp === undefined || isNaN(currentTemp)) {
    return null;
  }

  // Get the point from N minutes ago
  // History array is ordered oldest to newest, so we want length - compareMinutesAgo
  const compareIndex = historyData.length - compareMinutesAgo;
  if (compareIndex < 0) {
    return null;
  }

  const pastPoint = historyData[compareIndex];
  if (!pastPoint || pastPoint.avg === null || pastPoint.avg === undefined) {
    return null;
  }

  // Calculate rate: (current - past) / time_in_hours
  const tempDiff = currentTemp - pastPoint.avg;
  const hoursElapsed = compareMinutesAgo / 60;

  return tempDiff / hoursElapsed;
}

/**
 * Format rate for display
 * @param {number|null} ratePerHour - Rate in °F per hour
 * @param {boolean} isHeating - Whether the system is actively heating
 * @returns {{text: string, className: string}} Formatted rate with CSS class
 */
export function formatRate(ratePerHour, isHeating = false) {
  if (ratePerHour === null || ratePerHour === undefined || isNaN(ratePerHour)) {
    return { text: '—', className: 'stable' };
  }

  const absRate = Math.abs(ratePerHour);

  // Consider stable if change is less than 0.5°F/hr
  if (absRate < 0.5) {
    return { text: '→ stable', className: 'stable' };
  }

  // Format the rate
  const sign = ratePerHour > 0 ? '+' : '';
  const arrow = ratePerHour > 0 ? '↑' : '↓';
  const className = ratePerHour > 0 ? 'heating' : 'cooling';

  // For fast changes (>10°F/hr), show per-minute rate
  if (absRate > 10) {
    const ratePerMinute = ratePerHour / 60;
    return {
      text: `${arrow} ${sign}${ratePerMinute.toFixed(2)}°/min`,
      className
    };
  }

  // Normal per-hour rate
  return {
    text: `${arrow} ${sign}${ratePerHour.toFixed(1)}°/hr`,
    className
  };
}

/**
 * Legacy function - calculate rate from raw readings buffer
 * @deprecated Use calculateRateFromHistory instead
 */
export function calculateRate(readings, windowMinutes = 5) {
  if (!readings || readings.length < 2) {
    return null;
  }

  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;

  const recentReadings = readings.filter(r => {
    const ts = new Date(r.timestamp).getTime();
    return now - ts <= windowMs;
  });

  if (recentReadings.length < 2) {
    return null;
  }

  recentReadings.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const first = recentReadings[0];
  const last = recentReadings[recentReadings.length - 1];

  const tempDiff = last.value - first.value;
  const timeDiffMs = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();
  const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

  if (timeDiffHours === 0) {
    return null;
  }

  return tempDiff / timeDiffHours;
}

/**
 * Get trend description based on delta between inside and outside
 * @param {number} delta - Temperature difference (inside - outside) in °F
 * @returns {string} Description of heating effort
 */
export function getDeltaDescription(delta) {
  if (delta === null || delta === undefined || isNaN(delta)) {
    return '';
  }

  if (delta < 2) {
    return 'minimal heating';
  } else if (delta < 5) {
    return 'light heating';
  } else if (delta < 10) {
    return 'moderate heating';
  } else if (delta < 20) {
    return 'significant heating';
  } else {
    return 'heavy heating';
  }
}
