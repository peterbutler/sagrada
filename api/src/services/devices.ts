import { Client } from 'tplink-smarthome-api';
import { DeviceName } from '../types/index.js';
import { publishDeviceState } from '../mqtt/bridge.js';

// Kasa client singleton
let client: Client | null = null;

// Device cache (discovered devices by alias)
const deviceCache = new Map<string, unknown>();

// Mapping from API device names to actual Kasa device aliases
const DEVICE_ALIAS_MAP: Record<DeviceName, string> = {
  heater: 'shed heater',
  fan: 'shed radiator fan',
  pump: 'pump',
};

/**
 * Get or create the Kasa client
 */
function getClient(): Client {
  if (!client) {
    client = new Client();
  }
  return client;
}

/**
 * Discover devices on the network
 * Call this on startup to populate the device cache
 */
export async function discoverDevices(timeout: number = 5000): Promise<void> {
  return new Promise((resolve) => {
    const kasaClient = getClient();

    kasaClient.startDiscovery({ discoveryTimeout: timeout });

    kasaClient.on('device-new', (device: { alias: string }) => {
      console.log(`Discovered Kasa device: ${device.alias}`);
      deviceCache.set(device.alias.toLowerCase(), device);
    });

    setTimeout(() => {
      kasaClient.stopDiscovery();
      console.log(`Device discovery complete. Found ${deviceCache.size} devices.`);
      resolve();
    }, timeout);
  });
}

/**
 * Get a device by name
 */
function getDevice(name: DeviceName): unknown {
  // Map API name to actual Kasa alias
  const alias = DEVICE_ALIAS_MAP[name];
  const device = deviceCache.get(alias.toLowerCase());

  if (!device) {
    throw new Error(
      `Device "${name}" (alias: "${alias}") not found. Available: ${Array.from(deviceCache.keys()).join(', ')}`
    );
  }

  return device;
}

/**
 * Turn a device on or off
 */
export async function setDeviceState(name: DeviceName, state: boolean): Promise<void> {
  const device = getDevice(name) as { setPowerState: (state: boolean) => Promise<void> };

  if (typeof device.setPowerState !== 'function') {
    throw new Error(`Device "${name}" does not support power control`);
  }

  await device.setPowerState(state);
  console.log(`Set ${name} to ${state ? 'ON' : 'OFF'}`);

  // Publish state change to MQTT so all clients get updated via WebSocket
  publishDeviceState(name, state);
}

/**
 * Get the current state of a device
 */
export async function getDeviceState(
  name: DeviceName
): Promise<{ state: boolean; power?: number; voltage?: number; current?: number }> {
  const device = getDevice(name) as {
    getPowerState: () => Promise<boolean>;
    emeter?: {
      getRealtime: () => Promise<{ power: number; voltage: number; current: number }>;
    };
  };

  if (typeof device.getPowerState !== 'function') {
    throw new Error(`Device "${name}" does not support power state query`);
  }

  const state = await device.getPowerState();

  // Try to get power metrics if available
  let power: number | undefined;
  let voltage: number | undefined;
  let current: number | undefined;

  if (device.emeter && typeof device.emeter.getRealtime === 'function') {
    try {
      const emeterData = await device.emeter.getRealtime();
      power = emeterData.power;
      voltage = emeterData.voltage;
      current = emeterData.current;
    } catch {
      // Device may not support emeter
    }
  }

  return { state, power, voltage, current };
}

/**
 * Get all discovered device names
 */
export function getDiscoveredDevices(): string[] {
  return Array.from(deviceCache.keys());
}
