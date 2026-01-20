/**
 * Energy flow calculations for the hydronic heating system.
 *
 * Based on thermal dynamics analysis of the actual system behavior.
 * Key insight: The floor is the bottleneck - it can only deliver heat
 * to the room as fast as the bamboo thermal resistance allows.
 *
 * Heat path: HEATER → TANK → FLOOR MASS → ROOM AIR → OUTSIDE
 */

// === SYSTEM CONSTANTS ===

// Tank: 20 gallons of water = 75.7 kg, specific heat 4186 J/(kg·°C)
const TANK_THERMAL_MASS_J_PER_C = 316880;

// Tank ambient loss coefficient (W per °C difference from ambient)
// Empirically derived from cooling rate observations
const TANK_LOSS_COEFFICIENT_W_PER_C = 2.7;

// Floor-to-room heat transfer coefficient
// Derived from: floor area ~25 ft², R-value ~1.4 for bamboo + air film
// UA_floor ≈ 25 ft² / 1.4 ft²·°F·hr/BTU × 0.293 W/(BTU/hr) ≈ 5.2 W/°F
// But empirical observation suggests higher effective UA due to radiation
// Using 6 W/°F based on observed floor-room temperature relationships
const FLOOR_TO_ROOM_UA_W_PER_F = 6;

// Building heat loss coefficient (UA for entire shed envelope)
// Derived from: walls, windows, air infiltration analysis
// UA_building ≈ 195 BTU/hr·°F × 0.293 = 57 W/°F... but that seems high
// Using empirical estimate of 32 W/°F based on observed behavior
const BUILDING_UA_W_PER_F = 32;

// Default heater power when on
const DEFAULT_HEATER_POWER_W = 1400;

// Floor thermal time constant (minutes)
// How long for floor to respond to water temperature changes
const FLOOR_TIME_CONSTANT_MIN = 35;

// Water transit time through floor coil (minutes)
const FLOOR_TRANSIT_MINUTES = 3;

// === UTILITY FUNCTIONS ===

function fahrenheitToCelsius(tempF) {
  if (tempF == null) return null;
  return (tempF - 32) / 1.8;
}

function celsiusToFahrenheit(tempC) {
  if (tempC == null) return null;
  return tempC * 1.8 + 32;
}

// === MAIN CALCULATIONS ===

/**
 * Calculate complete energy flow through the heating system.
 *
 * @param {Object} params
 * @param {number} params.tankTempF - Tank temperature in °F
 * @param {number} params.floorTempF - Floor surface temperature in °F
 * @param {number} params.roomTempF - Room air temperature in °F (desk sensor)
 * @param {number} params.outsideTempF - Outside temperature in °F
 * @param {number} params.tankRateFPerHr - Tank temperature rate of change in °F/hr
 * @param {boolean} params.heaterOn - Whether heater is currently on
 * @param {boolean} params.pumpOn - Whether pump is currently on
 * @param {number} [params.heaterPower] - Heater power in watts (default 1400W)
 * @returns {Object} Energy flow values in watts and system status
 */
export function calculateEnergyFlow({
  tankTempF,
  floorTempF,
  roomTempF,
  outsideTempF,
  tankRateFPerHr,
  heaterOn,
  pumpOn,
  heaterPower = DEFAULT_HEATER_POWER_W
}) {
  const result = {
    // Energy flows (watts)
    heaterInput: 0,
    tankAccumulation: null,
    tankLoss: null,
    floorOutput: null,        // Heat from floor to room (the useful output!)
    buildingLoss: null,       // Heat escaping to outside
    waterToFloor: null,       // Heat transferred from water to floor mass

    // Temperature differences
    tankToAmbientDeltaF: null,
    floorToRoomDeltaF: null,
    roomToOutsideDeltaF: null,

    // System status
    heaterOn,
    pumpOn,
    valid: false,

    // Capacity analysis
    maxCapacityDeltaF: null,  // Max indoor-outdoor ΔT system can maintain
    isKeepingUp: null,        // Is heater capacity sufficient?
    bottleneckWatts: null,    // How much the floor can output at current temps
  };

  // Need at minimum tank and room temps for basic calculations
  if (tankTempF == null || roomTempF == null) {
    return result;
  }

  result.valid = true;

  // === HEATER INPUT ===
  result.heaterInput = heaterOn ? heaterPower : 0;

  // === TANK CALCULATIONS ===
  result.tankToAmbientDeltaF = tankTempF - roomTempF;
  const tankToAmbientDeltaC = result.tankToAmbientDeltaF / 1.8;

  // Tank loses heat to surrounding room air
  result.tankLoss = TANK_LOSS_COEFFICIENT_W_PER_C * tankToAmbientDeltaC;

  // Tank accumulation (energy being stored/released)
  if (tankRateFPerHr != null) {
    const tankRateCPerSec = (tankRateFPerHr / 1.8) / 3600;
    result.tankAccumulation = TANK_THERMAL_MASS_J_PER_C * tankRateCPerSec;
  }

  // === FLOOR OUTPUT (the key metric!) ===
  if (floorTempF != null) {
    result.floorToRoomDeltaF = floorTempF - roomTempF;
    // This is the actual useful heat output to the room
    result.floorOutput = FLOOR_TO_ROOM_UA_W_PER_F * result.floorToRoomDeltaF;

    // Clamp to zero if floor is colder than room (shouldn't happen when heating)
    if (result.floorOutput < 0) result.floorOutput = 0;
  }

  // === BUILDING HEAT LOSS ===
  if (outsideTempF != null) {
    result.roomToOutsideDeltaF = roomTempF - outsideTempF;
    result.buildingLoss = BUILDING_UA_W_PER_F * result.roomToOutsideDeltaF;
  }

  // === WATER TO FLOOR (when pump is running) ===
  // This is calculated from energy balance: what leaves tank goes to floor
  if (pumpOn && result.tankAccumulation != null) {
    // Water carries: heater input - tank accumulation - tank loss
    result.waterToFloor = result.heaterInput - result.tankAccumulation - result.tankLoss;
    if (result.waterToFloor < 0) result.waterToFloor = 0;
  } else if (!pumpOn) {
    result.waterToFloor = 0;
  }

  // === CAPACITY ANALYSIS ===
  // Max ΔT the heater can maintain at steady state
  result.maxCapacityDeltaF = heaterPower / BUILDING_UA_W_PER_F;

  // Is the system keeping up?
  if (result.buildingLoss != null) {
    // At steady state, floor output must equal building loss
    // If building loss > heater capacity, we're falling behind
    result.isKeepingUp = result.buildingLoss <= heaterPower;
  }

  // Bottleneck: max heat floor can deliver at current floor temp
  // (If floor were as hot as water, how much could it output?)
  if (floorTempF != null && tankTempF != null) {
    // Current floor output capacity
    result.bottleneckWatts = result.floorOutput;
  }

  return result;
}

/**
 * Calculate the time-shifted floor coil temperature drop.
 * Water takes ~3 minutes to travel from beginning to end of the floor coil.
 *
 * @param {number} beginningTempPast - Beginning temperature from 3 minutes ago (°F)
 * @param {number} endTempNow - Current end temperature (°F)
 * @returns {Object} { deltaF, wattsExtracted, valid }
 */
export function calculateFloorDelta(beginningTempPast, endTempNow) {
  if (beginningTempPast == null || endTempNow == null) {
    return { deltaF: null, wattsExtracted: null, valid: false };
  }

  const deltaF = beginningTempPast - endTempNow;

  // Calculate watts extracted using Q = ṁ × Cp × ΔT
  // Flow rate ~1 gal/min = 0.063 kg/s, Cp = 4186 J/kg·°C
  // But we need to convert ΔT from °F to °C first
  const deltaCelsius = deltaF / 1.8;
  const flowRateKgPerSec = 0.063; // ~1 gal/min
  const specificHeat = 4186; // J/kg·°C
  const wattsExtracted = flowRateKgPerSec * specificHeat * deltaCelsius;

  return {
    deltaF,
    wattsExtracted: Math.round(wattsExtracted),
    valid: true
  };
}

/**
 * Calculate system equilibrium prediction.
 * Given current heater state, what temperatures will the system reach?
 *
 * @param {number} outsideTempF - Outside temperature
 * @param {number} heaterPower - Heater power in watts (0 if off)
 * @returns {Object} Predicted equilibrium temperatures
 */
export function calculateEquilibrium(outsideTempF, heaterPower) {
  if (outsideTempF == null) {
    return { roomTempF: null, valid: false };
  }

  // At equilibrium: heater power = building loss
  // heaterPower = UA_building × (T_room - T_outside)
  // T_room = T_outside + heaterPower / UA_building
  const deltaF = heaterPower / BUILDING_UA_W_PER_F;
  const roomTempF = outsideTempF + deltaF;

  return {
    roomTempF: Math.round(roomTempF),
    deltaF: Math.round(deltaF),
    valid: true
  };
}

/**
 * Format watts for display
 */
export function formatWatts(watts, showSign = false) {
  if (watts == null) return '--';
  const rounded = Math.round(watts);
  const absValue = Math.abs(rounded);
  const formatted = absValue >= 1000
    ? `${(absValue / 1000).toFixed(1)}kW`
    : `${absValue}W`;

  if (showSign && rounded > 0) return `+${formatted}`;
  if (rounded < 0) return `-${formatted}`;
  return formatted;
}

/**
 * Format temperature difference for display
 */
export function formatDeltaF(deltaF) {
  if (deltaF == null) return '--';
  const rounded = Math.round(deltaF * 10) / 10;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}°F`;
}

// Export constants for testing/reference
export const CONSTANTS = {
  TANK_THERMAL_MASS_J_PER_C,
  TANK_LOSS_COEFFICIENT_W_PER_C,
  FLOOR_TO_ROOM_UA_W_PER_F,
  BUILDING_UA_W_PER_F,
  DEFAULT_HEATER_POWER_W,
  FLOOR_TIME_CONSTANT_MIN,
  FLOOR_TRANSIT_MINUTES
};
