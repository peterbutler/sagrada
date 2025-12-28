# Sagrada API Reference

Technical documentation for the Sagrada API endpoints and WebSocket protocol.

## Base URL

```
http://sagrada.local/api
ws://sagrada.local/ws
```

## REST Endpoints

### Health Check

```
GET /health
```

Returns API status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-27T19:00:00.000Z"
}
```

---

### Get Sensor History

```
GET /api/sensors/history
```

Returns historical temperature data for a location.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `location` | string | Yes | Sensor location (e.g., `desk`, `tank`) |
| `minutes` | number | No | Minutes of history (default: 60, max: 1440) |

**Example:**
```
GET /api/sensors/history?location=desk&minutes=60
```

**Response:**
```json
{
  "success": true,
  "data": {
    "location": "desk",
    "metric": "temperature",
    "unit": "F",
    "data": [
      {
        "timestamp": "2025-12-27T18:00:00.000Z",
        "avg": 68.5,
        "min": 68.2,
        "max": 68.8
      }
    ]
  }
}
```

---

### Set Target Temperature

```
POST /api/control/target
```

Sets the workspace target temperature.

**Request Body:**
```json
{
  "temperature": 70,
  "duration_hours": 2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `temperature` | number | Yes | Target temperature in °F (50-90) |
| `duration_hours` | number | No | How long to maintain target (default: 1, max: 24) |

**Response:**
```json
{
  "success": true
}
```

---

### Control Device

```
POST /api/control/device
```

Turns a device on or off.

**Request Body:**
```json
{
  "device": "heater",
  "state": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `device` | string | Yes | Device name: `heater`, `pump`, or `fan` |
| `state` | boolean | Yes | `true` for on, `false` for off |

**Response:**
```json
{
  "success": true
}
```

---

### Schedule Heating

```
POST /api/schedule/heat
```

Schedules a one-time heating event.

**Request Body:**
```json
{
  "start_time": "2025-12-28T07:00:00Z",
  "duration_hours": 4,
  "temperature": 70
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `start_time` | string | Yes | ISO 8601 datetime |
| `duration_hours` | number | Yes | Duration in hours (max: 24) |
| `temperature` | number | No | Target temperature (default: 70) |

**Response:**
```json
{
  "success": true,
  "id": "123"
}
```

---

### Get Next Scheduled Event

```
GET /api/schedule/next
```

Returns the next scheduled heating event.

**Response (event exists):**
```json
{
  "success": true,
  "scheduled": true,
  "id": "123",
  "start_time": "2025-12-28T07:00:00Z",
  "end_time": "2025-12-28T11:00:00Z",
  "temperature": 70
}
```

**Response (no event):**
```json
{
  "success": true,
  "scheduled": false
}
```

---

### Cancel Next Scheduled Event

```
DELETE /api/schedule/next
```

Cancels the next scheduled heating event.

**Response:**
```json
{
  "success": true,
  "message": "Next scheduled event cancelled"
}
```

---

## WebSocket Protocol

### Connection

```javascript
const ws = new WebSocket('ws://sagrada.local/ws');
```

### Message Format

All messages are JSON with a `type` field:

```typescript
interface SensorUpdate {
  type: 'sensor_update';
  location: string;
  metric: string;
  value: number | boolean;
  unit?: string;
  timestamp: string;
}
```

### On Connect

When a client connects, the server immediately sends the current value for every sensor as individual `sensor_update` messages. This provides initial state without a separate API call.

### Live Updates

After the initial flood, the server sends `sensor_update` messages whenever a sensor publishes a new reading to MQTT (typically every 1 second for temperature sensors).

### Example Messages

**Temperature reading:**
```json
{
  "type": "sensor_update",
  "location": "desk",
  "metric": "temperature",
  "value": 8.5,
  "unit": "C",
  "timestamp": "2025-12-27T19:00:00.000Z"
}
```

**Device state:**
```json
{
  "type": "sensor_update",
  "location": "heater",
  "metric": "state",
  "value": true,
  "timestamp": "2025-12-27T19:00:00.000Z"
}
```

**Power reading:**
```json
{
  "type": "sensor_update",
  "location": "heater",
  "metric": "power",
  "value": 1398.5,
  "unit": "W",
  "timestamp": "2025-12-27T19:00:00.000Z"
}
```

**Target temperature:**
```json
{
  "type": "sensor_update",
  "location": "shed",
  "metric": "target_temp_f",
  "value": 70,
  "unit": "F",
  "timestamp": "2025-12-27T19:00:00.000Z"
}
```

### Client Example

```javascript
const ws = new WebSocket('ws://sagrada.local/ws');

const sensorData = {};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'sensor_update') {
    // Store latest value by location and metric
    if (!sensorData[msg.location]) {
      sensorData[msg.location] = {};
    }
    sensorData[msg.location][msg.metric] = {
      value: msg.value,
      unit: msg.unit,
      timestamp: msg.timestamp
    };

    // Update UI
    updateDisplay(msg.location, msg.metric, msg.value);
  }
};

ws.onclose = () => {
  // Reconnect after 1 second
  setTimeout(() => connect(), 1000);
};
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP/WebSocket server port | `3001` |
| `DB_HOST` | MySQL host | `127.0.0.1` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_USER` | MySQL username | `root` |
| `DB_PASSWORD` | MySQL password | (none) |
| `DB_NAME` | MySQL database | `climate` |
| `MQTT_BROKER` | MQTT broker URL | `mqtt://localhost:1883` |

### Example .env

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=peter
DB_PASSWORD=secret
DB_NAME=climate
MQTT_BROKER=mqtt://localhost:1883
PORT=3001
```

---

## MQTT Topics

The API subscribes to these MQTT topic patterns:

| Pattern | Example | Description |
|---------|---------|-------------|
| `shed/heating/+/temperature` | `shed/heating/tank/temperature` | Heating loop sensors |
| `shed/ambient/+/temperature` | `shed/ambient/desk/temperature` | Ambient sensors |
| `shed/outside/+/temperature` | `shed/outside/north/temperature` | Outdoor sensors |
| `kasa/+/+` | `kasa/heater/power` | Smart plug metrics |

### MQTT Payload Format

Temperature sensors publish JSON:
```json
{
  "value": 20.5,
  "unit": "C",
  "ts": 1735322400.123,
  "sensor": "28-3c0ae3811275"
}
```

---

## Error Handling

All endpoints return errors in a consistent format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

HTTP status codes:
- `200` — Success
- `400` — Bad request (validation error)
- `500` — Internal server error

---

## Valid Locations

```
desk, floor, outside, tank, pre-tank, beginning, end,
heater, pump, fan, system, door, workbench
```

---

## Deployment

### Systemd Service

```bash
sudo systemctl status sagrada-api
sudo systemctl restart sagrada-api
sudo journalctl -u sagrada-api -f
```

### Nginx Proxy

The API runs on port 3001 and is proxied through nginx:

- `/api/*` → `http://127.0.0.1:3001/api/*`
- `/ws` → `ws://127.0.0.1:3001/ws`
- `/health` → `http://127.0.0.1:3001/health`
