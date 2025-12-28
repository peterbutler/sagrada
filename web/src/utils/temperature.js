/**
 * Convert Celsius to Fahrenheit
 * @param {number} celsius - Temperature in Celsius
 * @returns {number} Temperature in Fahrenheit
 */
export function celsiusToFahrenheit(celsius) {
  if (celsius === null || celsius === undefined || isNaN(celsius)) {
    return null;
  }
  return (celsius * 9/5) + 32;
}

/**
 * Format temperature for display
 * @param {number} fahrenheit - Temperature in Fahrenheit
 * @param {boolean} showUnit - Whether to include °F suffix
 * @returns {string} Formatted temperature string
 */
export function formatTemperature(fahrenheit, showUnit = true) {
  if (fahrenheit === null || fahrenheit === undefined || isNaN(fahrenheit)) {
    return '--.-' + (showUnit ? '°F' : '');
  }
  const formatted = fahrenheit.toFixed(1);
  return showUnit ? `${formatted}°F` : formatted;
}

/**
 * Get temperature value class based on context
 * @param {number} fahrenheit - Temperature value
 * @returns {string} CSS class name
 */
export function getTemperatureClass(fahrenheit) {
  if (fahrenheit === null || fahrenheit === undefined) {
    return 'missing';
  }
  return '';
}
