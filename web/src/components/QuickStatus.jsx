import React from 'react';
import { formatTemperature } from '../utils/temperature';
import { formatRate } from '../utils/rateCalculation';

/**
 * Quick status bar showing current conditions at a glance
 */
export function QuickStatus({
  currentTemp,
  targetTemp,
  heatingRate,
  isHeating,
  devices,
  sensors
}) {
  const currentTempDisplay = formatTemperature(currentTemp);
  const targetTempDisplay = targetTemp ? `${targetTemp}°F` : 'OFF';
  const targetClassName = targetTemp ? '' : 'off';

  // Get heating status message
  let heatingStatus = 'System in standby mode';
  if (isHeating && heatingRate !== null) {
    const rateInfo = formatRate(heatingRate, true);
    if (targetTemp) {
      heatingStatus = `${rateInfo.text}`;
    } else {
      heatingStatus = 'Heating active';
    }
  } else if (targetTemp) {
    heatingStatus = 'Target set, waiting for heat';
  }

  return (
    <section className="panel quick-status">
      <div>
        <div className="current-temp-display">
          <span className="current-temp">{currentTempDisplay}</span>
          <span className="temp-arrow">→</span>
          <span className={`target-temp ${targetClassName}`}>{targetTempDisplay}</span>
        </div>
        <div className={`heating-status ${isHeating ? 'active' : ''}`}>
          {heatingStatus}
        </div>
      </div>

      <div className="status-grid">
        <StatusCell
          label="Heater"
          value={devices.heater?.state ? 'ON' : 'OFF'}
          isOn={devices.heater?.state}
        />
        <StatusCell
          label="Pump"
          value={devices.pump?.state ? 'ON' : 'OFF'}
          isOn={devices.pump?.state}
        />
        <StatusCell
          label="Fan"
          value={devices.fan?.state ? 'ON' : 'OFF'}
          isOn={devices.fan?.state}
        />
        <StatusCell
          label="Outside"
          value={formatTemperature(sensors.outside?.temperature, false)}
          isTemp
        />
        <StatusCell
          label="Tank"
          value={formatTemperature(sensors.tank?.temperature, false)}
          isTemp
        />
        <StatusCell
          label="Floor"
          value={formatTemperature(sensors.floor?.temperature, false)}
          isTemp
        />
      </div>
    </section>
  );
}

function StatusCell({ label, value, isOn, isTemp }) {
  let className = 'status-cell-value';
  if (!isTemp) {
    className += isOn ? ' on' : ' off';
  }

  return (
    <div className="status-cell">
      <span className="status-cell-label">{label}</span>
      <span className={className}>{value}</span>
    </div>
  );
}
