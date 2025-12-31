# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sagrada is a climate monitoring and control system for a greenhouse/shed. It collects temperature/humidity data from BLE sensors and Kasa smart plugs, controls heating equipment, and provides a real-time web dashboard.

## Development Commands

### Web Frontend
```bash
cd web
npm install              # Install dependencies
npm start                # Dev server on port 3000 with HMR (proxies API to sagrada.local:3001)
npm run build            # Production build to ../public/dist
npm run build:deploy     # Build + rsync to Pi
npm test                 # Run Jest tests
```

### API Server
```bash
cd api
npm install              # Install dependencies
npm run dev              # Dev server with tsx watch (port 3001)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled JavaScript
```

### Python Services
```bash
cd services
pip install -e .                       # Install package in editable mode
python scripts/run_collector.py        # Run sensor collector
python scripts/run_controller.py       # Run heating controller
python scripts/run_mqtt_logger.py      # Run MQTT logger
python scripts/run_ble_bridge.py       # Run BLE-MQTT bridge
python scripts/run_display.py          # Run terminal display
python scripts/run_aggregator.py       # Run data aggregator
```

## Architecture

```
Sensors (BLE/Kasa) → Python Collector → MQTT → API Server → WebSocket → React Dashboard
                                          ↓
                                     MySQL Database
```

**Data Flow:**
1. Python services collect sensor data and publish to MQTT
2. API server subscribes to MQTT and broadcasts to WebSocket clients
3. REST endpoints handle queries and device control commands
4. MQTT logger persists all messages to MySQL

**Key Design Decisions:**
- WebSocket for real-time push, REST for request/response
- MQTT as backbone for service-to-service communication
- Dual table approach: `sensor_readings` (history) + `current_readings` (latest)

## Deployment

### Web Frontend
```bash
cd web && npm run build:deploy
```

### API Server
```bash
rsync -avz --delete api/ sagrada.local:/home/peterbutler/www/api/ --exclude node_modules
ssh sagrada.local "cd /home/peterbutler/www/api && npm install && sudo systemctl restart sagrada-api"
```

### Pi Services
| Service | Command |
|---------|---------|
| API server | `sudo systemctl restart sagrada-api` |
| Web server | `sudo systemctl restart nginx` |
| View API logs | `journalctl -u sagrada-api -f` |

## Database

MySQL on sagrada.local:
- Database: `climate`, User: `peter`, Password: `mef9abRA`

```bash
ssh sagrada.local "mysql -u peter -p'mef9abRA' climate -e 'YOUR QUERY'"
```

## Key Files

**Web:**
- `web/src/hooks/useWebSocket.js` - WebSocket connection with auto-reconnect
- `web/src/hooks/useHistory.js` - Historical data and rate array computation
- `web/src/utils/rateCalculation.js` - Linear regression rate calculation
- `web/src/components/TemperatureChart.jsx` - Chart with rate mode display

**API:**
- `api/src/index.ts` - Server setup, MQTT bridge initialization
- `api/src/mqtt/bridge.ts` - MQTT subscription and message routing
- `api/src/websocket/index.ts` - WebSocket broadcast mechanism
- `api/src/services/` - Business logic (sensors, devices, thermostat, schedule)

**Python:**
- `services/sagrada/shared/database.py` - ReadingsStorage class with all DB operations
- `services/sagrada/shared/models.py` - Reading dataclass
- `services/sagrada/collector/` - Sensor readers (Kasa, BLE, MySQL)

## Sensor Locations

| Location | Description |
|----------|-------------|
| `desk` | Workspace air temperature |
| `floor` | Floor/thermal mass |
| `tank` | Water storage tank |
| `pre-tank` | Return line before tank |
| `beginning` / `end` | Heating coil inlet/outlet |
| `outside` | Outdoor temperature |

## Controlled Devices

Kasa smart plugs: `heater` (1400W element), `pump` (circulation), `fan` (radiator)
