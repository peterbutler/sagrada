# CLAUDE.md

This file provides guidance to Claude Code when working in the Python services directory.

## Setup

```bash
pip install -e .           # Install package in editable mode
pip install -e ".[dev]"    # Include dev dependencies (pytest, black, mypy)
```

## Running Services

```bash
python scripts/run_collector.py        # Sensor data collection
python scripts/run_controller.py       # Heating control logic
python scripts/run_mqtt_logger.py      # Persist MQTT to MySQL
python scripts/run_ble_bridge.py       # BLE sensor to MQTT bridge
python scripts/run_display.py          # Terminal display on /dev/tty1
python scripts/run_aggregator.py       # Data aggregation
```

## Service Descriptions

| Service | Purpose |
|---------|---------|
| **collector** | Reads from Kasa smart plugs, publishes to MQTT |
| **controller** | Reads target temp from DB, controls heater/pump/fan |
| **mqtt_logger** | Subscribes to MQTT topics, writes to `sensor_readings` table |
| **ble_bridge** | Discovers BLE temperature sensors, maps to locations, publishes to MQTT |
| **display** | Rich terminal UI for headless monitoring |
| **aggregator** | Aggregates `minute_readings` from raw sensor data |

## Key Files

| File | Purpose |
|------|---------|
| `sagrada/shared/database.py` | ReadingsStorage class with all DB operations |
| `sagrada/shared/models.py` | Reading dataclass |
| `sagrada/shared/mqtt.py` | MQTT client wrapper |
| `sagrada/collector/collector.py` | Main collector logic |
| `sagrada/controller/controller.py` | Heating control logic |

## Configuration Files

| File | Purpose |
|------|---------|
| `../config/config-sagrada.yaml` | Main environment config (Kasa devices, DB queries) |
| `../config/ble-bridge.yaml` | BLE sensor device mapping |
| `../config/mqtt-logger.yaml` | MQTT logger topic subscriptions |

## Code Style

```bash
black --line-length 100 .
isort --profile black .
```

## Sensor Locations

| Location | Description |
|----------|-------------|
| `desk` | Workspace air temperature |
| `floor` | Floor/thermal mass |
| `tank` | Water storage tank |
| `pre-tank` | Return line before tank |
| `beginning` / `end` | Heating coil inlet/outlet |
| `outside` / `north` | Outdoor temperature |
| `workbench` / `door` | BLE sensors |

## Controlled Devices (Kasa Smart Plugs)

| Device | Description |
|--------|-------------|
| `heater` | 1400W water heater element |
| `pump` | Circulation pump |
| `fan` | Radiator fan |
