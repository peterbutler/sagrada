import React from 'react';
import PropTypes from 'prop-types';
import {
  calculateEnergyFlow,
  calculateFloorDelta,
  calculateEquilibrium,
  formatWatts,
  CONSTANTS
} from '../utils/energyCalculation';

/**
 * Energy flow visualization showing the actual heat path through the system:
 * HEATER → TANK → FLOOR → ROOM → OUTSIDE
 *
 * Key insight from thermal analysis: The floor is the bottleneck.
 * It can only deliver heat to the room as fast as the bamboo allows.
 */
export function EnergyFlow({
  tankTempF,
  floorTempF,
  roomTempF,
  outsideTempF,
  tankRate,
  heaterState,
  heaterPower,
  pumpState,
  beginningTempPast,
  endTempNow
}) {
  const energy = calculateEnergyFlow({
    tankTempF,
    floorTempF,
    roomTempF,
    outsideTempF,
    tankRateFPerHr: tankRate,
    heaterOn: heaterState,
    pumpOn: pumpState,
    heaterPower
  });

  // Calculate time-shifted floor coil delta (water-side heat extraction)
  const floorDelta = calculateFloorDelta(beginningTempPast, endTempNow);

  // Calculate equilibrium prediction
  const equilibrium = calculateEquilibrium(
    outsideTempF,
    heaterState ? (heaterPower || CONSTANTS.DEFAULT_HEATER_POWER_W) : 0
  );

  // Determine system status
  let statusText = '';
  let statusClass = '';
  if (!energy.valid) {
    statusText = 'Waiting for data...';
    statusClass = 'waiting';
  } else if (energy.isKeepingUp === false) {
    statusText = 'Heater undersized for conditions';
    statusClass = 'warning';
  } else if (pumpState && heaterState) {
    statusText = 'Active heating';
    statusClass = 'active';
  } else if (pumpState && !heaterState) {
    statusText = 'Circulating from storage';
    statusClass = 'circulating';
  } else if (!pumpState && heaterState) {
    statusText = 'Charging tank';
    statusClass = 'charging';
  } else {
    statusText = 'Idle';
    statusClass = 'idle';
  }

  // Energy balance indicator
  const netEnergy = energy.floorOutput != null && energy.buildingLoss != null
    ? energy.floorOutput - energy.buildingLoss
    : null;

  let balanceText = '';
  let balanceClass = 'neutral';
  if (netEnergy != null) {
    if (netEnergy > 20) {
      balanceText = 'Room warming';
      balanceClass = 'warming';
    } else if (netEnergy < -20) {
      balanceText = 'Room cooling';
      balanceClass = 'cooling';
    } else {
      balanceText = 'Stable';
      balanceClass = 'stable';
    }
  }

  return (
    <div className="energy-flow">
      {/* Primary metrics: Floor Output vs Building Loss */}
      <div className="energy-hero">
        <div className="energy-hero-main">
          <span className="energy-hero-label">FLOOR → ROOM</span>
          <span className={`energy-hero-value ${energy.floorOutput > 0 ? 'active' : 'inactive'}`}>
            {formatWatts(energy.floorOutput)}
          </span>
          {energy.floorToRoomDeltaF != null && (
            <span className="energy-hero-detail">
              Δ{energy.floorToRoomDeltaF.toFixed(0)}°F
            </span>
          )}
        </div>

        <div className="energy-hero-vs">vs</div>

        <div className="energy-hero-secondary">
          <span className="energy-hero-label">ROOM → OUT</span>
          <span className={`energy-hero-value loss`}>
            {formatWatts(energy.buildingLoss)}
          </span>
          {energy.roomToOutsideDeltaF != null && (
            <span className="energy-hero-detail">
              Δ{energy.roomToOutsideDeltaF.toFixed(0)}°F
            </span>
          )}
        </div>
      </div>

      {/* Balance indicator */}
      <div className={`energy-balance ${balanceClass}`}>
        <span className="energy-balance-net">
          {netEnergy != null ? formatWatts(netEnergy, true) : '--'}
        </span>
        <span className="energy-balance-text">{balanceText}</span>
      </div>

      {/* Heat path: HEATER → TANK → FLOOR */}
      <div className="energy-path">
        <div className="energy-path-row">
          <EnergyNode
            label="HEATER"
            value={formatWatts(energy.heaterInput)}
            detail={heaterState ? 'ON' : 'OFF'}
            active={heaterState}
            type="source"
          />
          <div className="energy-arrow">→</div>
          <EnergyNode
            label="TANK"
            value={formatWatts(energy.tankAccumulation, true)}
            detail={tankTempF != null ? `${Math.round(tankTempF)}°F` : '--'}
            active={Math.abs(energy.tankAccumulation || 0) > 20}
            type={energy.tankAccumulation > 20 ? 'charging' : energy.tankAccumulation < -20 ? 'draining' : 'stable'}
          />
          <div className="energy-arrow">→</div>
          <EnergyNode
            label="FLOOR"
            value={formatWatts(energy.floorOutput)}
            detail={floorTempF != null ? `${Math.round(floorTempF)}°F` : '--'}
            active={pumpState && energy.floorOutput > 0}
            type="output"
          />
        </div>

        {/* Tank loss branch (smaller, de-emphasized) */}
        <div className="energy-path-loss">
          <span className="energy-loss-label">Tank loss:</span>
          <span className="energy-loss-value">{formatWatts(energy.tankLoss)}</span>
        </div>
      </div>

      {/* Water-side metrics (when pump running) */}
      {pumpState && floorDelta.valid && (
        <div className="energy-water-side">
          <div className="energy-water-metric">
            <span className="energy-water-label">Water → Floor:</span>
            <span className="energy-water-value">{formatWatts(floorDelta.wattsExtracted)}</span>
            <span className="energy-water-detail">({floorDelta.deltaF.toFixed(1)}°F drop)</span>
          </div>
        </div>
      )}

      {/* System capacity info */}
      {equilibrium.valid && (
        <div className="energy-capacity">
          <span className="energy-capacity-label">
            {heaterState ? 'Target equilibrium:' : 'If heating:'}
          </span>
          <span className="energy-capacity-value">
            {equilibrium.roomTempF}°F room
          </span>
          <span className="energy-capacity-detail">
            (+{equilibrium.deltaF}°F above outside)
          </span>
        </div>
      )}

      {/* Status */}
      <div className={`energy-status ${statusClass}`}>
        {statusText}
      </div>
    </div>
  );
}

EnergyFlow.propTypes = {
  tankTempF: PropTypes.number,
  floorTempF: PropTypes.number,
  roomTempF: PropTypes.number,
  outsideTempF: PropTypes.number,
  tankRate: PropTypes.number,
  heaterState: PropTypes.bool,
  heaterPower: PropTypes.number,
  pumpState: PropTypes.bool,
  beginningTempPast: PropTypes.number,
  endTempNow: PropTypes.number
};

/**
 * Individual node in the heat path
 */
function EnergyNode({ label, value, detail, active, type }) {
  return (
    <div className={`energy-node ${type} ${active ? 'active' : ''}`}>
      <span className="energy-node-label">{label}</span>
      <span className="energy-node-value">{value}</span>
      <span className="energy-node-detail">{detail}</span>
    </div>
  );
}

EnergyNode.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  detail: PropTypes.string,
  active: PropTypes.bool,
  type: PropTypes.string
};
