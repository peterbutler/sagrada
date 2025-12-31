import React from 'react';
import PropTypes from 'prop-types';
import { calculateEnergyFlow, calculateFloorDelta, formatWatts } from '../utils/energyCalculation';

/**
 * Energy flow visualization showing how heat moves through the system:
 * ADD (heater) → STORE (tank) → SPEND (floor + ambient losses)
 */
export function EnergyFlow({
  tankTempF,
  ambientTempF,
  tankRate,
  heaterState,
  heaterPower,
  pumpState,
  beginningTempPast,  // Beginning temp from 3 minutes ago
  endTempNow          // Current end temp
}) {
  const energy = calculateEnergyFlow({
    tankTempF,
    ambientTempF,
    tankRateFPerHr: tankRate,
    heaterOn: heaterState,
    pumpOn: pumpState,
    heaterPower
  });

  // Calculate time-shifted floor coil delta
  const floorDelta = calculateFloorDelta(beginningTempPast, endTempNow);

  // Determine status text based on system state
  let statusText = '';
  if (!energy.valid) {
    statusText = 'Waiting for data...';
  } else if (pumpState && heaterState) {
    statusText = 'Heating & circulating';
  } else if (pumpState && !heaterState) {
    statusText = 'Circulating from storage';
  } else if (!pumpState && heaterState) {
    statusText = 'Charging heater reservoir';
  } else {
    statusText = 'System idle';
  }

  // Net balance indicator
  let balanceClass = 'neutral';
  let balanceLabel = '';
  if (energy.netBalance != null) {
    if (energy.netBalance > 50) {
      balanceClass = 'surplus';
      balanceLabel = 'surplus';
    } else if (energy.netBalance < -50) {
      balanceClass = 'deficit';
      balanceLabel = 'deficit';
    } else {
      balanceLabel = 'stable';
    }
  }

  return (
    <div className="energy-flow">
      {/* Hero row: Floor delivery + Net balance */}
      <div className="energy-hero">
        <div className="energy-hero-main">
          <span className="energy-hero-label">FLOOR DELIVERY</span>
          <span className={`energy-hero-value ${pumpState ? 'active' : 'inactive'}`}>
            {pumpState ? formatWatts(energy.floorDelivery) : '--'}
          </span>
          <span className="energy-hero-status">{statusText}</span>
        </div>
        <div className="energy-hero-balance">
          <span className="energy-hero-label">NET BALANCE</span>
          <span className={`energy-hero-value ${balanceClass}`}>
            {formatWatts(energy.netBalance, true)}
          </span>
          <span className="energy-balance-label">{balanceLabel}</span>
        </div>
      </div>

      {/* Detail row: ADD → STORE → SPEND */}
      <div className="energy-boxes">
        <EnergyBox
          label="ADD"
          sublabel="Heater"
          value={formatWatts(energy.energyInput)}
          active={heaterState}
          indicator={heaterState ? 'on' : 'off'}
        />
        <div className="energy-arrow">→</div>
        <EnergyBox
          label="STORE"
          sublabel="Tank"
          value={formatWatts(energy.tankAccumulation, true)}
          detail={tankTempF != null ? `${Math.round(tankTempF)}°F` : '--'}
          active={energy.tankAccumulation != null && Math.abs(energy.tankAccumulation) > 10}
          indicator={energy.tankAccumulation > 50 ? 'charging' : energy.tankAccumulation < -50 ? 'draining' : 'stable'}
        />
        <div className="energy-arrow">→</div>
        <EnergyBox
          label="LOSS"
          sublabel="Ambient"
          value={formatWatts(energy.tankLoss != null ? -energy.tankLoss : null)}
          detail={energy.deltaC != null ? `Δ${Math.round(energy.deltaC)}°C` : '--'}
          active={energy.tankLoss != null && energy.tankLoss > 50}
          indicator="loss"
        />
      </div>

      {/* Floor coil delta (when pump is on and we have time-shifted data) */}
      {pumpState && floorDelta.valid && (
        <div className="energy-floor-delta">
          <span className="energy-floor-label">Floor coil drop:</span>
          <span className="energy-floor-value">
            {floorDelta.deltaF.toFixed(1)}°F
          </span>
          <span className="energy-floor-note">(begin→end, 3min shift)</span>
        </div>
      )}
    </div>
  );
}

EnergyFlow.propTypes = {
  tankTempF: PropTypes.number,
  ambientTempF: PropTypes.number,
  tankRate: PropTypes.number,
  heaterState: PropTypes.bool,
  heaterPower: PropTypes.number,
  pumpState: PropTypes.bool,
  beginningTempPast: PropTypes.number,
  endTempNow: PropTypes.number
};

/**
 * Individual energy box in the flow diagram
 */
function EnergyBox({ label, sublabel, value, detail, active, indicator }) {
  return (
    <div className={`energy-box ${active ? 'active' : ''} ${indicator || ''}`}>
      <span className="energy-box-label">{label}</span>
      <span className="energy-box-sublabel">{sublabel}</span>
      <span className="energy-box-value">{value}</span>
      {detail && <span className="energy-box-detail">{detail}</span>}
    </div>
  );
}

EnergyBox.propTypes = {
  label: PropTypes.string.isRequired,
  sublabel: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  detail: PropTypes.string,
  active: PropTypes.bool,
  indicator: PropTypes.string
};
