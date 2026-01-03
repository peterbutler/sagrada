# CLAUDE.md

This file provides guidance to Claude Code when working in the API directory.

## Development

```bash
npm install              # Install dependencies
npm run dev              # Dev server with tsx watch (port 3001)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled JavaScript
```

## Architecture

- Express server with WebSocket support on port 3001
- MQTT bridge subscribes to sensor topics, broadcasts to WebSocket clients
- REST endpoints for control/scheduling, WebSocket for real-time push
- Kasa smart plug discovery and control

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Server setup, MQTT bridge initialization |
| `src/mqtt/bridge.ts` | MQTT subscription and message routing |
| `src/websocket/index.ts` | WebSocket broadcast mechanism |
| `src/services/` | Business logic (sensors, devices, thermostat, schedule) |

## API Documentation

See `API-REFERENCE.md` for complete endpoint documentation including:
- REST endpoints (history, control, scheduling)
- WebSocket protocol and message formats
- MQTT topic patterns

## Deployment

```bash
rsync -avz --delete ./ sagrada.local:/home/peterbutler/sagrada/api/ --exclude node_modules
ssh sagrada.local "cd /home/peterbutler/sagrada/api && npm install && sudo systemctl restart sagrada-api"
```

View logs: `ssh sagrada.local "journalctl -u sagrada-api -f"`
