import mqtt from 'mqtt';
import { getMqttConfig } from '../config/mqtt.js';
import { broadcast } from '../websocket/index.js';
import { SensorUpdate } from '../types/index.js';

let client: mqtt.MqttClient | null = null;

/**
 * Map MQTT location names to canonical names used in the database
 */
const LOCATION_MAP: Record<string, string> = {
  supply: 'beginning',
  return: 'end',
  north: 'outside',
};

/**
 * Parse MQTT topic to extract location and metric
 * Actual topic structure:
 *   shed/heating/{location}/temperature
 *   shed/ambient/{location}/temperature
 *   shed/outside/{location}/temperature
 *   kasa/{device}/{metric}
 */
function parseTopic(topic: string): { location: string; metric: string } | null {
  const parts = topic.split('/');

  // shed/{category}/{location}/{metric}
  if (parts[0] === 'shed' && parts.length === 4) {
    const rawLocation = parts[2];
    const location = LOCATION_MAP[rawLocation] || rawLocation;
    const metric = parts[3];
    return { location, metric };
  }

  // kasa/{device}/{metric}
  if (parts[0] === 'kasa' && parts.length === 3) {
    return { location: parts[1], metric: parts[2] };
  }

  return null;
}

interface SensorPayload {
  value: number;
  unit?: string;
  ts?: number;
  sensor?: string;
}

/**
 * Parse MQTT payload value
 * Payloads can be:
 *   - JSON: {"value": 8.5, "unit": "C", "ts": 1766862028, "sensor": "28-xxx"}
 *   - Plain number: "8.5"
 *   - Boolean-like: "1", "true", "on"
 */
function parsePayload(payload: string, metric: string): { value: number | boolean; unit?: string } {
  // Try parsing as JSON first
  try {
    const parsed = JSON.parse(payload) as SensorPayload;
    if (typeof parsed.value === 'number') {
      return { value: parsed.value, unit: parsed.unit };
    }
  } catch {
    // Not JSON, parse as plain value
  }

  // Handle state metrics
  if (metric === 'state') {
    const val = payload.toLowerCase();
    return { value: val === '1' || val === 'true' || val === 'on' };
  }

  // Parse as plain number
  return { value: parseFloat(payload) };
}

/**
 * Get unit for a metric
 */
function getUnit(metric: string): string | undefined {
  switch (metric) {
    case 'temperature':
      return 'C';
    case 'power':
      return 'W';
    case 'voltage':
      return 'V';
    case 'current':
      return 'A';
    default:
      return undefined;
  }
}

/**
 * Set up MQTT client and bridge to WebSocket
 */
export function setupMqttBridge(): void {
  const config = getMqttConfig();

  client = mqtt.connect(config.brokerUrl);

  client.on('connect', () => {
    console.log('Connected to MQTT broker');

    for (const topic of config.topics) {
      client?.subscribe(topic, (err) => {
        if (err) {
          console.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`Subscribed to ${topic}`);
        }
      });
    }
  });

  client.on('message', (topic, payload) => {
    const parsed = parseTopic(topic);
    if (!parsed) {
      return;
    }

    const { location, metric } = parsed;
    const { value, unit: payloadUnit } = parsePayload(payload.toString(), metric);

    const update: SensorUpdate = {
      type: 'sensor_update',
      location,
      metric,
      value,
      unit: payloadUnit || getUnit(metric),
      timestamp: new Date().toISOString(),
    };

    broadcast(update);
  });

  client.on('error', (err) => {
    console.error('MQTT error:', err);
  });

  client.on('close', () => {
    console.log('MQTT connection closed');
  });
}

/**
 * Publish a device state update to MQTT
 * This broadcasts to all subscribers including our own bridge → WebSocket
 */
export function publishDeviceState(device: string, state: boolean): void {
  if (!client) {
    console.warn('MQTT client not connected, cannot publish device state');
    return;
  }

  const topic = `kasa/${device}/state`;
  const payload = state ? 'on' : 'off';

  client.publish(topic, payload, (err) => {
    if (err) {
      console.error(`Failed to publish to ${topic}:`, err);
    } else {
      console.log(`Published ${topic}: ${payload}`);
    }
  });
}

/**
 * Close MQTT connection
 */
export function closeMqttBridge(): void {
  if (client) {
    client.end();
    client = null;
  }
}
