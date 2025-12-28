import React from 'react';
import { SensorRow } from './SensorRow';

/**
 * Panel containing a group of sensors with optional chart
 */
export function SensorPanel({
  title,
  icon,
  sensors,
  isHeating,
  children
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-icon">{icon}</span>
        <span className="panel-title">{title}</span>
      </div>
      <div className="sensor-list">
        {sensors.map((sensor) => (
          <SensorRow
            key={sensor.id || sensor.label}
            label={sensor.label}
            temperature={sensor.temperature}
            rate={sensor.rate}
            timestamp={sensor.timestamp}
            isHeating={isHeating}
            customTrend={sensor.customTrend}
          />
        ))}
      </div>
      {children}
    </section>
  );
}
