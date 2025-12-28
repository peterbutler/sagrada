// Sensor update message (WebSocket)
export interface SensorUpdate {
  type: 'sensor_update';
  location: string;
  metric: string;
  value: number | boolean;
  unit?: string;
  timestamp: string;
}

// Sensor locations (format: {system}/{location}, e.g. "heating/tank", "ambient/desk")
export type SensorLocation = string;

// Device names (Kasa smart plugs)
export type DeviceName = 'heater' | 'pump' | 'fan';

// Metrics
export type MetricType =
  | 'temperature'
  | 'state'
  | 'power'
  | 'voltage'
  | 'current'
  | 'target_temp_f'
  | 'target_temp_f_tank';

// History data point
export interface HistoryDataPoint {
  timestamp: string;
  avg: number;
  min: number;
  max: number;
}

// History response
export interface HistoryResponse {
  location: string;
  metric: string;
  unit: string;
  data: HistoryDataPoint[];
}

// Control requests
export interface SetTargetRequest {
  temperature: number;
  duration_hours?: number;
}

export interface SetDeviceRequest {
  device: DeviceName;
  state: boolean;
}

// Schedule requests
export interface ScheduleHeatRequest {
  start_time: string;
  duration_hours: number;
}

export interface ScheduledEvent {
  id: string;
  start_time: string;
  end_time: string;
  temperature: number;
}

// API responses
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
