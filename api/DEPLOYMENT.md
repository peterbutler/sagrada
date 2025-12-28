# TypeScript API - Deployment Next Steps

## Current Status
- API code is complete and compiles
- Located in `api/` directory on branch `feature/typescript-api`
- Not yet deployed or tested against real infrastructure

## Prerequisites on Pi
- [x] Node.js v22 installed
- [x] Git access to GitHub configured
- [ ] Branch pushed to GitHub
- [ ] Clone/pull on Pi

## Deployment Steps

### 1. Push the feature branch
```bash
# From local machine
cd /Users/peterbutler/dev/sagrada/www
git push origin feature/typescript-api
```

### 2. Pull on Pi
```bash
# SSH to Pi
ssh sagrada.local

# Navigate to www directory (needs to be git-tracked first - see repo cleanup)
cd ~/www
git fetch origin
git checkout feature/typescript-api

# Or if www isn't git-tracked yet, clone fresh:
cd ~
git clone git@github.com:peterbutler/sagrada.git sagrada-new
cd sagrada-new/www
git checkout feature/typescript-api
```

### 3. Create .env file
```bash
cd ~/www/api  # or ~/sagrada-new/www/api

# Copy template
cp .env.example .env

# Edit with real values - get DB creds from PHP config:
cat ../public/api/config/database.php

# Edit .env:
nano .env
```

Required values:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=<from php config>
DB_PASSWORD=<from php config>
DB_NAME=thermostat
MQTT_BROKER=mqtt://localhost:1883
PORT=3001
```

### 4. Install dependencies and test
```bash
cd ~/www/api
npm install
npm run dev
```

### 5. Test endpoints
```bash
# In another terminal on Pi
curl http://localhost:3001/health
curl "http://localhost:3001/api/sensors/history?location=desk&minutes=60"

# Watch WebSocket (if wscat installed)
npx wscat -c ws://localhost:3001/ws
```

### 6. Check MQTT bridge
- Verify sensor updates appear in WebSocket
- Check console output for MQTT connection

### 7. Test device control
```bash
curl -X POST http://localhost:3001/api/control/device \
  -H "Content-Type: application/json" \
  -d '{"device": "heater", "state": true}'
```

## After Testing: Production Setup

1. Create systemd service for the new API
2. Configure nginx to proxy to port 3001
3. Migrate frontend to use new API
4. Deprecate PHP API

---

## Blockers

The main blocker is that `~/www` on the Pi is not git-tracked. This is addressed in the repo cleanup plan.
