import { useMemo } from 'react';
import { calculateRate, formatRate, getDeltaDescription } from '../utils/rateCalculation';

/**
 * Hook for calculating and formatting rate of change
 * @param {Array<{timestamp: string, value: number}>} readings - Historical readings
 * @param {boolean} isHeating - Whether system is actively heating
 * @returns {{
 *   rate: number|null,
 *   formatted: {text: string, className: string}
 * }}
 */
export function useRateOfChange(readings, isHeating = false) {
  return useMemo(() => {
    const rate = calculateRate(readings);
    const formatted = formatRate(rate, isHeating);

    return {
      rate,
      formatted
    };
  }, [readings, isHeating]);
}

/**
 * Hook for calculating delta description
 * @param {number|null} insideTemp - Inside temperature (desk)
 * @param {number|null} outsideTemp - Outside temperature
 * @returns {{
 *   delta: number|null,
 *   description: string
 * }}
 */
export function useDelta(insideTemp, outsideTemp) {
  return useMemo(() => {
    if (insideTemp === null || insideTemp === undefined ||
        outsideTemp === null || outsideTemp === undefined) {
      return { delta: null, description: '' };
    }

    const delta = insideTemp - outsideTemp;
    const description = getDeltaDescription(delta);

    return { delta, description };
  }, [insideTemp, outsideTemp]);
}
