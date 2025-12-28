# Sagrada Climate Monitoring System

A climate monitoring and control system for the shed, consisting of:

- **Sensor Collection**: BLE temperature/humidity sensors, Kasa smart plugs, MySQL queries
- **Heating Control**: Automated control of heater, pump, and fan via smart plugs
- **Data Logging**: MQTT-based data pipeline to MySQL database
- **Web Dashboard**: Real-time React frontend with WebSocket updates
- **Terminal Display**: Rich terminal UI for dedicated display

## Directory Structure

```
sagrada/
├── api/                    # TypeScript API server (Express + WebSocket + MQTT)
├── web/                    # React frontend
├── public/                 # Static files for web
├── services/               # Python services package
│   └── sagrada/
│       ├── shared/         # Shared utilities (database, config, models)
│       ├── collector/      # Sensor data collection
│       ├── controller/     # Heating control logic
│       ├── display/        # Terminal display
│       ├── mqtt_logger/    # MQTT to database logger
│       └── ble_bridge/     # BLE to MQTT bridge
├── scripts/                # Service entry points
├── config/                 # Configuration files
├── deploy/                 # Deployment scripts and systemd services
└── docs/                   # Documentation
```

## Quick Start

### Development (Local)

1. Install Python dependencies:
   ```bash
   cd services
   pip install -e .
   ```

2. Copy and configure environment:
   ```bash
   cp config/.env.example config/.env
   # Edit config/.env with your database credentials
   ```

3. Run a service:
   ```bash
   python scripts/run_collector.py
   ```

### Deployment (Pi)

1. Clone the repository:
   ```bash
   git clone <repo-url> ~/sagrada
   cd ~/sagrada
   ```

2. Run the install script:
   ```bash
   ./deploy/install.sh
   ```

3. Configure environment:
   ```bash
   cp config/.env.example config/.env
   nano config/.env
   ```

4. Start services:
   ```bash
   sudo systemctl start climate-collector
   sudo systemctl start mqtt-logger
   # etc.
   ```

## Services

| Service | Description | Port |
|---------|-------------|------|
| climate-collector | Collects sensor data from various sources | - |
| climate-controller | Controls heating system | - |
| climate-display | Terminal display on /dev/tty1 | - |
| mqtt-logger | Logs MQTT messages to database | - |
| ble-mqtt-bridge | Bridges BLE sensors to MQTT | - |
| sagrada-api | REST + WebSocket API | 3001 |
| mosquitto | MQTT broker | 1883 |

## Configuration

Environment-specific configuration is in `config/config-{env}.yaml`.
Database credentials are in `config/.env`.
