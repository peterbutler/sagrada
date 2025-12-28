import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchHistory } from '../api/client';

// Number of historical minute buckets (not including current)
const HISTORY_MINUTES = 59;

// How many minutes back to compare for rate calculation
const RATE_LOOKBACK_MINUTES = 5;

/**
 * Get the minute bucket key for a timestamp
 * @param {Date|string|number} timestamp
 * @returns {string} Key like "2024-12-27T19:30"
 */
function getMinuteKey(timestamp) {
  const date = new Date(timestamp);
  return date.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
}

/**
 * Calculate rate array from value points
 * Each rate compares current point to RATE_LOOKBACK_MINUTES ago
 * @param {Array<{avg: number}>} points - Array of data points with avg values
 * @param {string} location - Location name for logging
 * @returns {Array<number|null>} Rate in °F/hr for each point
 */
function calculateRateArray(points, location = 'unknown') {
  if (!points || points.length < RATE_LOOKBACK_MINUTES + 1) {
    return points ? points.map(() => null) : [];
  }

  return points.map((point, i) => {
    if (i < RATE_LOOKBACK_MINUTES || point?.avg === null || point?.avg === undefined) {
      return null;
    }
    const pastPoint = points[i - RATE_LOOKBACK_MINUTES];
    if (!pastPoint || pastPoint.avg === null || pastPoint.avg === undefined) {
      return null;
    }
    // Rate per hour: (current - past) / (lookback / 60)
    const hoursElapsed = RATE_LOOKBACK_MINUTES / 60;
    const rate = (point.avg - pastPoint.avg) / hoursElapsed;

    // Log the last (current) rate calculation
    if (i === points.length - 1) {
      console.log(`[Rate ${location}] current=${point.avg.toFixed(2)}°F (i=${i}), past=${pastPoint.avg.toFixed(2)}°F (i=${i - RATE_LOOKBACK_MINUTES}), diff=${(point.avg - pastPoint.avg).toFixed(2)}°F, rate=${rate.toFixed(2)}°F/hr`);
    }

    return rate;
  });
}

/**
 * Hook for fetching and managing historical sensor data with proper
 * minute-based aggregation for real-time updates.
 *
 * Architecture:
 * - history[]: 59 points of minute-averaged data (-60m to -1m)
 * - currentMinute: accumulates readings for the current minute
 * - Chart displays: history + current (latest reading as "0m")
 * - Rates are pre-computed comparing each point to 5 minutes prior
 *
 * When a new minute starts:
 * 1. Average all readings from the previous minute
 * 2. Shift that into history (drop oldest)
 * 3. Reset current minute buffer
 */
export function useHistory(locations, minutes = 60) {
  // Historical data by location: { [location]: Array<{timestamp, avg, min, max}> }
  const [history, setHistory] = useState({});

  // Current minute buffer by location: { [location]: { readings: number[], minuteKey: string } }
  const currentMinuteRef = useRef({});

  // Current/latest reading by location (for the "0m" point)
  const [current, setCurrent] = useState({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const locationsRef = useRef(locations);
  locationsRef.current = locations;

  /**
   * Fetch historical data from API
   */
  const fetchAllLocations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const results = await Promise.all(
        locationsRef.current.map(async (location) => {
          try {
            const response = await fetchHistory(location, minutes);
            if (response.success && response.data) {
              return {
                location,
                data: response.data.data || []
              };
            }
            return { location, data: [] };
          } catch (err) {
            console.error(`Failed to fetch history for ${location}:`, err);
            return { location, data: [] };
          }
        })
      );

      const newHistory = {};
      const newCurrent = {};

      for (const result of results) {
        const locationData = result.data;

        if (locationData.length > 0) {
          // Take all but the last point as history, but cap at HISTORY_MINUTES
          // The last point will be replaced by live data
          const historyData = locationData.slice(0, -1);
          // Only keep the most recent HISTORY_MINUTES points
          newHistory[result.location] = historyData.length > HISTORY_MINUTES
            ? historyData.slice(-HISTORY_MINUTES)
            : historyData;

          // Use the last historical point as initial "current"
          const lastPoint = locationData[locationData.length - 1];
          newCurrent[result.location] = {
            timestamp: lastPoint.timestamp,
            value: lastPoint.avg
          };

          console.log(`[useHistory] Loaded ${result.location}: ${locationData.length} from API -> ${newHistory[result.location].length} in history`);
        } else {
          newHistory[result.location] = [];
          newCurrent[result.location] = null;
        }

        // Initialize current minute buffer
        currentMinuteRef.current[result.location] = {
          readings: [],
          minuteKey: getMinuteKey(new Date())
        };
      }

      setHistory(newHistory);
      setCurrent(newCurrent);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [minutes]);

  // Fetch on mount
  useEffect(() => {
    fetchAllLocations();
  }, [fetchAllLocations]);

  /**
   * Process a new reading from WebSocket
   * - Updates the "current" (0m) point immediately
   * - Accumulates readings for minute aggregation
   * - On minute boundary, shifts aggregated data into history
   */
  const updateReading = useCallback((location, reading) => {
    const { timestamp, value } = reading;
    const readingMinuteKey = getMinuteKey(timestamp);

    // Update current (latest) value immediately
    setCurrent(prev => ({
      ...prev,
      [location]: { timestamp, value }
    }));

    // Get or initialize the current minute buffer
    if (!currentMinuteRef.current[location]) {
      currentMinuteRef.current[location] = {
        readings: [],
        minuteKey: readingMinuteKey
      };
    }

    const buffer = currentMinuteRef.current[location];

    // Check if we've crossed into a new minute
    if (readingMinuteKey !== buffer.minuteKey && buffer.readings.length > 0) {
      // Calculate average of the completed minute
      const sum = buffer.readings.reduce((a, b) => a + b, 0);
      const avg = sum / buffer.readings.length;
      const min = Math.min(...buffer.readings);
      const max = Math.max(...buffer.readings);

      // Create the aggregated point for the completed minute
      const aggregatedPoint = {
        timestamp: buffer.minuteKey + ':00.000Z',
        avg,
        min,
        max
      };

      // Shift into history
      setHistory(prev => {
        const locationHistory = prev[location] || [];

        // Add the new aggregated point, trim to max size
        const updated = [...locationHistory, aggregatedPoint];
        if (updated.length > HISTORY_MINUTES) {
          updated.shift();
        }

        return {
          ...prev,
          [location]: updated
        };
      });

      // Reset buffer for new minute
      buffer.readings = [value];
      buffer.minuteKey = readingMinuteKey;
    } else {
      // Same minute - accumulate
      buffer.readings.push(value);
      buffer.minuteKey = readingMinuteKey;
    }
  }, []);

  /**
   * Refresh all history data from API
   */
  const refresh = useCallback(() => {
    fetchAllLocations();
  }, [fetchAllLocations]);

  /**
   * Build chart data: history + current point
   * Returns data in the format expected by TemperatureChart
   *
   * For the current point, we use the average of readings accumulated
   * in the current minute buffer to smooth out sensor noise.
   */
  const data = useMemo(() => {
    const chartData = {};

    for (const location of locationsRef.current) {
      const locationHistory = history[location] || [];
      const currentReading = current[location];
      const buffer = currentMinuteRef.current[location];

      // Build array: history points + current point
      const points = [...locationHistory];

      if (currentReading) {
        // Use smoothed value from current minute buffer if available
        let smoothedValue = currentReading.value;
        if (buffer && buffer.readings.length > 0) {
          const sum = buffer.readings.reduce((a, b) => a + b, 0);
          smoothedValue = sum / buffer.readings.length;
        }

        points.push({
          timestamp: currentReading.timestamp,
          avg: smoothedValue,
          min: currentReading.value,
          max: currentReading.value
        });
      }

      chartData[location] = points;
    }

    return chartData;
  }, [history, current]);

  /**
   * Pre-computed rates for each location
   * Each rate array corresponds to the data array
   */
  const rates = useMemo(() => {
    const rateData = {};
    const firstLocation = locationsRef.current[0];

    for (const location of locationsRef.current) {
      const points = data[location] || [];
      rateData[location] = calculateRateArray(points, location);
    }

    // Log data structure info for first location
    if (firstLocation && data[firstLocation]) {
      const points = data[firstLocation];
      const lastIdx = points.length - 1;
      const compareIdx = lastIdx - RATE_LOOKBACK_MINUTES;
      if (points.length > RATE_LOOKBACK_MINUTES) {
        console.log(`[Data structure ${firstLocation}] total points=${points.length}, last timestamp=${points[lastIdx]?.timestamp}, compare timestamp=${points[compareIdx]?.timestamp}`);
      }
    }

    return rateData;
  }, [data]);

  /**
   * Get the current (most recent) rate for a location
   */
  const getCurrentRate = useCallback((location) => {
    const locationRates = rates[location];
    if (!locationRates || locationRates.length === 0) {
      return null;
    }
    return locationRates[locationRates.length - 1];
  }, [rates]);

  return {
    data,
    rates,
    getCurrentRate,
    loading,
    error,
    refresh,
    updateReading
  };
}

/**
 * Hook for a single location's history
 */
export function useLocationHistory(location, minutes = 60) {
  const { data, rates, getCurrentRate, loading, error, refresh, updateReading } = useHistory([location], minutes);

  return {
    data: data[location] || [],
    rates: rates[location] || [],
    currentRate: getCurrentRate(location),
    loading,
    error,
    refresh,
    updateReading: (reading) => updateReading(location, reading)
  };
}
