# Sagrada API

A real-time API for the Sagrada greenhouse monitoring and control system.

## Overview

The Sagrada API provides a unified interface for monitoring temperature sensors, controlling heating equipment, and scheduling heating events. It serves as the backend for the web dashboard and can support multiple simultaneous clients including mobile devices and a TTY display.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Clients                              │
│   (Web Dashboard, Mobile, TTY Display)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Sagrada API                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ REST        │  │ WebSocket   │  │ MQTT Bridge         │ │
│  │ Endpoints   │  │ Server      │◄─┤ (sensor subscriber) │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌───────────┐  ┌───────────┐  ┌───────────┐
│  MariaDB  │  │   MQTT    │  │   Kasa    │
│ (climate) │  │  Broker   │  │  Devices  │
└───────────┘  └───────────┘  └───────────┘
```

## Key Concepts

### Real-Time Updates via WebSocket

Unlike traditional polling-based APIs, Sagrada uses WebSocket connections to push sensor updates to clients as they happen. When a temperature sensor publishes a new reading to MQTT, the API immediately forwards it to all connected WebSocket clients. This enables sub-second latency from sensor to display.

### Hybrid REST + WebSocket Design

- **WebSocket** for real-time data streams (sensor readings, state changes)
- **REST** for commands and queries (set temperature, get history, manage schedules)

This separation keeps the protocol simple: WebSocket handles the "push" use case, REST handles "request/response" use cases.

### MQTT Bridge

The API subscribes to MQTT topics where sensors publish their readings. It acts as a bridge, converting MQTT messages into WebSocket messages for browser clients. This means clients don't need direct MQTT access—they just connect to the WebSocket.

### Device Control

Smart plugs (Kasa) for the heater, pump, and fan are discovered on startup and can be controlled via the API. The API also receives power metrics (watts, voltage, current) from these devices.

## Data Flow

### Sensor Reading → Dashboard Display

```
1. DS18B20 sensor reads temperature
2. Collector service publishes to MQTT: shed/heating/tank/temperature
3. Sagrada API receives MQTT message
4. API broadcasts to all WebSocket clients
5. Dashboard updates display immediately
```

### User Sets Temperature

```
1. User clicks "72°F" on dashboard
2. Dashboard sends POST /api/control/target {temperature: 72}
3. API writes to thermostat_control table
4. Controller service reads target, activates heater if needed
5. Kasa device state change published to MQTT
6. API broadcasts state update to WebSocket clients
```

## Sensor Locations

| Location | Description |
|----------|-------------|
| `desk` | Workspace air temperature |
| `floor` | Floor/thermal mass temperature |
| `outside` | Outdoor temperature |
| `tank` | Water storage tank |
| `pre-tank` | Return line before tank |
| `beginning` | Heating coil inlet |
| `end` | Heating coil outlet |

## Controlled Devices

| Device | Description |
|--------|-------------|
| `heater` | 1400W water heater element |
| `pump` | Circulation pump |
| `fan` | Radiator fan |

## Related Components

- **climate-controller** — Python service that decides when to heat based on target temperature
- **climate-monitor** — Python service that collects sensor readings
- **mqtt-logger** — Python service that logs all MQTT messages to database
- **mosquitto** — MQTT broker
- **mariadb** — Database storing readings, schedules, and control state

## Why TypeScript?

The previous PHP API used polling (every 5 seconds). This created unnecessary load and latency. Node.js with WebSocket support enables:

- Push-based real-time updates
- Persistent connections for lower overhead
- Native MQTT client integration
- Same language as the frontend (easier full-stack development)
