# CLAUDE.md

This file provides guidance to Claude Code when working in the web frontend directory.

## Development

```bash
npm install                              # Install dependencies
npm start                                # Dev server on port 3000 (proxies API to sagrada.local:3001)
npm run build                            # Production build to ../public/dist
npm test                                 # Run Jest tests
npm test -- --testPathPattern="filename" # Run single test file
```

## Architecture

- React 18 with React Router
- WebSocket for real-time sensor updates (auto-reconnect)
- Chart.js for temperature graphs
- TanStack Query for REST data fetching

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useWebSocket.js` | WebSocket connection with auto-reconnect |
| `src/hooks/useHistory.js` | Historical data fetching and rate arrays |
| `src/hooks/useSensorData.js` | Sensor state management |
| `src/utils/rateCalculation.js` | Linear regression for rate-of-change |
| `src/components/TemperatureChart.jsx` | Chart with rate mode display |
| `src/pages/Dashboard.jsx` | Main dashboard page |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard - main monitoring view |
| `/explorer` | Data exploration and queries |
| `/debug` | Debug information |

## Deployment

```bash
npm run build:deploy    # Builds and rsyncs to Pi
```

This runs `webpack --mode production` and rsyncs `../public/` to `sagrada.local:/home/peterbutler/www/public/`.
