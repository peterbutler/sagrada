import React, { useState, useEffect } from 'react';
import { formatTemperature } from '../utils/temperature';
import { formatRate } from '../utils/rateCalculation';
import { formatTimeAgo, getStalenessClass } from '../utils/formatting';

/**
 * Individual sensor row with label, value, trend, and staleness indicator
 */
export function SensorRow({
  label,
  temperature,
  rate,
  timestamp,
  isHeating = false,
  customTrend
}) {
  // Force re-render frequently to show ms counter ticking up
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 100); // Update every 100ms for smooth counting
    return () => clearInterval(interval);
  }, []);

  const tempDisplay = formatTemperature(temperature);
  const tempClassName = temperature === null ? 'sensor-value missing' : 'sensor-value';

  // Use custom trend if provided (e.g., for delta display)
  let trendText, trendClassName;
  if (customTrend) {
    trendText = customTrend.text;
    trendClassName = customTrend.className || 'stable';
  } else {
    const rateInfo = formatRate(rate, isHeating);
    trendText = rateInfo.text;
    trendClassName = rateInfo.className;
  }

  // Staleness indicator
  const stalenessText = formatTimeAgo(timestamp);
  const stalenessClass = getStalenessClass(timestamp);

  return (
    <div className="sensor-row">
      <span className="sensor-label">{label}</span>
      <span className={tempClassName}>{tempDisplay}</span>
      <span className={`sensor-trend ${trendClassName}`}>{trendText}</span>
      <span className={`sensor-staleness ${stalenessClass}`}>{stalenessText}</span>
    </div>
  );
}
