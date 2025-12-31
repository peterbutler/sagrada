/**
 * Energy flow calculations for the hydronic heating system.
 *
 * Constants derived from empirical analysis of historical data:
 * - Tank thermal mass calculated from 20 gallon volume
 * - Loss coefficient (k) derived from observed cooling rates during idle periods
 */

// 20 gallons of water = 75.7 kg, specific heat 4186 J/(kg·°C)
const TANK_THERMAL_MASS_J_PER_C = 316880;

// Empirically derived: tank loses 2.7W per °C of temperature difference
const TANK_LOSS_COEFFICIENT_W_PER_C = 2.7;

// Default heater power when on
const DEFAULT_HEATER_POWER_W = 1400;

/**
 * Convert Fahrenheit to Celsius
 */
function fahrenheitToCelsius(tempF) {
  return (tempF - 32) / 1.8;
}

/**
 * Calculate energy flow through the heating system.
 *
 * @param {Object} params
 * @param {number} params.tankTempF - Tank temperature in °F
 * @param {number} params.ambientTempF - Ambient (desk) temperature in °F
 * @param {number} params.tankRateFPerHr - Tank temperature rate of change in °F/hr
 * @param {boolean} params.heaterOn - Whether heater is currently on
 * @param {boolean} params.pumpOn - Whether pump is currently on
 * @param {number} [params.heaterPower] - Heater power in watts (default 1400W)
 * @returns {Object} Energy flow values in watts
 */
export function calculateEnergyFlow({
  tankTempF,
  ambientTempF,
  tankRateFPerHr,
  heaterOn,
  pumpOn,
  heaterPower = DEFAULT_HEATER_POWER_W
}) {
  // Handle missing data
  if (tankTempF == null || ambientTempF == null) {
    return {
      energyInput: 0,
      tankAccumulation: null,
      tankLoss: null,
      floorDelivery: null,
      netBalance: null,
      deltaC: null,
      heaterOn,
      pumpOn,
      valid: false
    };
  }

  // Convert to Celsius for calculations
  const tankTempC = fahrenheitToCelsius(tankTempF);
  const ambientTempC = fahrenheitToCelsius(ambientTempF);
  const deltaC = tankTempC - ambientTempC;

  // Tank ambient loss (always happening when tank is warmer than ambient)
  const tankLossW = TANK_LOSS_COEFFICIENT_W_PER_C * deltaC;

  // Tank accumulation rate (positive = storing energy, negative = depleting)
  let tankAccumulationW = null;
  if (tankRateFPerHr != null) {
    // Convert °F/hr to °C/sec, then multiply by thermal mass to get watts
    const tankRateCPerSec = (tankRateFPerHr / 1.8) / 3600;
    tankAccumulationW = TANK_THERMAL_MASS_J_PER_C * tankRateCPerSec;
  }

  // Energy input from heater
  const energyInputW = heaterOn ? heaterPower : 0;

  // Floor delivery calculation
  let floorDeliveryW = null;
  if (pumpOn && tankAccumulationW != null) {
    // When pump is on: floor gets what's left after storage and ambient losses
    // floor = input - accumulation - ambient_loss
    floorDeliveryW = energyInputW - tankAccumulationW - tankLossW;
  } else if (!pumpOn) {
    // When pump is off, no water circulating to floor
    floorDeliveryW = 0;
  }

  // Net balance: positive = surplus (storing), negative = deficit (drawing from storage)
  // When heater on: net = input - floor - loss = accumulation
  // When heater off: net = -floor - loss (all negative, drawing down)
  let netBalance = null;
  if (tankAccumulationW != null) {
    netBalance = tankAccumulationW;
  }

  return {
    energyInput: energyInputW,
    tankAccumulation: tankAccumulationW,
    tankLoss: tankLossW,
    floorDelivery: floorDeliveryW,
    netBalance,
    deltaC,
    heaterOn,
    pumpOn,
    valid: true
  };
}

/**
 * Format watts for display
 * @param {number} watts
 * @param {boolean} showSign - Whether to show + for positive values
 * @returns {string}
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
 * Calculate the time-shifted floor coil temperature drop.
 * Water takes ~3 minutes to travel from beginning to end of the floor coil.
 * So we compare beginning[t-3min] to end[t] to see actual heat delivered.
 *
 * @param {number} beginningTempPast - Beginning temperature from 3 minutes ago (°F)
 * @param {number} endTempNow - Current end temperature (°F)
 * @returns {Object} { deltaF, deltaC, valid }
 */
export function calculateFloorDelta(beginningTempPast, endTempNow) {
  if (beginningTempPast == null || endTempNow == null) {
    return { deltaF: null, deltaC: null, valid: false };
  }

  const deltaF = beginningTempPast - endTempNow;
  const deltaC = deltaF / 1.8;

  return {
    deltaF,
    deltaC,
    valid: true
  };
}

// Export constants for testing/reference
export const CONSTANTS = {
  TANK_THERMAL_MASS_J_PER_C,
  TANK_LOSS_COEFFICIENT_W_PER_C,
  DEFAULT_HEATER_POWER_W,
  FLOOR_TRANSIT_MINUTES: 3
};
