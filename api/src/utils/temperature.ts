/**
 * Convert Celsius to Fahrenheit
 */
export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/**
 * Convert Fahrenheit to Celsius
 */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

/**
 * Round temperature to 1 decimal place
 */
export function roundTemp(temp: number): number {
  return Math.round(temp * 10) / 10;
}

/**
 * Validate temperature is within acceptable range (Fahrenheit)
 */
export function isValidTargetTemp(temp: number): boolean {
  return temp >= 50 && temp <= 90;
}
