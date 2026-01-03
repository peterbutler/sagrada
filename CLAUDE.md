# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sagrada is a climate monitoring and control system for a greenhouse/shed. It runs on a Raspberry Pi (`sagrada.local`) and provides:
- Real-time temperature monitoring from BLE and wired sensors
- Smart plug control for heating equipment (Kasa devices)
- Web dashboard for monitoring and control
- Automated heating based on target temperatures and schedules

**Tech Stack:** React frontend, TypeScript/Express API, Python services, MySQL, MQTT

## Architecture

```
Sensors (BLE/Kasa) → Python Services → MQTT → API Server → WebSocket → React Dashboard
                                         ↓
                                    MySQL Database
```

**Data Flow:**
1. Python services collect sensor data and publish to MQTT
2. API server subscribes to MQTT and broadcasts to WebSocket clients
3. REST endpoints handle queries and device control commands
4. MQTT logger persists all messages to MySQL

## Repository Structure

| Directory | Description |
|-----------|-------------|
| `api/` | TypeScript REST/WebSocket API server |
| `web/` | React frontend dashboard |
| `services/` | Python data collection and control services |
| `config/` | YAML configuration files |
| `deploy/` | Systemd service files |

Each component has its own `CLAUDE.md` with development commands and details.

## Production Access

**SSH:** `ssh sagrada.local`

**Database:** MySQL on sagrada.local
```bash
ssh sagrada.local "mysql -u peter -p'mef9abRA' climate -e 'YOUR QUERY'"
```

**Service Logs:**
```bash
ssh sagrada.local "journalctl -u sagrada-api -f"      # API server
ssh sagrada.local "journalctl -u climate-collector -f" # Collector
```

**Systemd Services:**
- `sagrada-api` - API server
- `climate-collector` - Sensor collection
- `climate-controller` - Heating control
- `mqtt-logger` - MQTT persistence
- `ble-mqtt-bridge` - BLE sensors
- `nginx` - Web server
