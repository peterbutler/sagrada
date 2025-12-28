/**
 * Sagrada API Client
 *
 * REST endpoints for the greenhouse monitoring system.
 * See api/API-REFERENCE.md for full documentation.
 */

// Use relative URL so it works with webpack dev server proxy
const BASE_URL = '/api';

/**
 * Fetch sensor history
 * @param {string} location - Sensor location (e.g., 'desk', 'tank')
 * @param {number} minutes - Minutes of history (default: 60, max: 1440)
 * @returns {Promise<{success: boolean, data: {location: string, metric: string, unit: string, data: Array}}>}
 */
export async function fetchHistory(location, minutes = 60) {
  const params = new URLSearchParams({ location, minutes: String(minutes) });
  const response = await fetch(`${BASE_URL}/sensors/history?${params}`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * Set target temperature
 * @param {number} temperature - Target temperature in °F (50-90)
 * @param {number} durationHours - How long to maintain target (default: 1, max: 24)
 * @returns {Promise<{success: boolean}>}
 */
export async function setTargetTemperature(temperature, durationHours = 1) {
  const response = await fetch(`${BASE_URL}/control/target`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      temperature,
      duration_hours: durationHours
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * Turn target temperature off
 * @returns {Promise<{success: boolean}>}
 */
export async function turnOffTarget() {
  // Set to 0 to turn off (per API design)
  const response = await fetch(`${BASE_URL}/control/target`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      temperature: 0,
      duration_hours: 0
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * Control a device (heater, pump, fan)
 * @param {string} device - Device name: 'heater', 'pump', or 'fan'
 * @param {boolean} state - true for on, false for off
 * @returns {Promise<{success: boolean}>}
 */
export async function setDeviceState(device, state) {
  const response = await fetch(`${BASE_URL}/control/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device, state })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * Get next scheduled heating event
 * @returns {Promise<{success: boolean, scheduled: boolean, id?: string, start_time?: string, end_time?: string, temperature?: number}>}
 */
export async function getNextSchedule() {
  const response = await fetch(`${BASE_URL}/schedule/next`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * Schedule a one-time heating event
 * @param {string} startTime - ISO 8601 datetime
 * @param {number} durationHours - Duration in hours (max: 24)
 * @param {number} temperature - Target temperature (default: 70)
 * @returns {Promise<{success: boolean, id?: string}>}
 */
export async function scheduleHeat(startTime, durationHours, temperature = 70) {
  const response = await fetch(`${BASE_URL}/schedule/heat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_time: startTime,
      duration_hours: durationHours,
      temperature
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * Cancel the next scheduled heating event
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function cancelNextSchedule() {
  const response = await fetch(`${BASE_URL}/schedule/next`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * Check API health
 * @returns {Promise<{status: string, timestamp: string}>}
 */
export async function checkHealth() {
  const response = await fetch('/health');

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}
