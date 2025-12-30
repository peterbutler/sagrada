# Sagrada Monorepo - Claude Code Guide

## Quick Deploy

### Web Frontend
```bash
cd web
npm run build:deploy
```
This builds the React app and rsyncs to `sagrada.local:/home/peterbutler/www/public/`

### API
The API runs on the Pi at `/home/peterbutler/www/api`. To deploy changes:
```bash
rsync -avz --delete api/ sagrada.local:/home/peterbutler/www/api/ --exclude node_modules
ssh sagrada.local "cd /home/peterbutler/www/api && npm install && sudo systemctl restart sagrada-api"
```

## Pi Directory Structure

- `/home/peterbutler/www/` - Main deployment directory (nginx serves from here)
  - `public/` - Static web files (React build output)
  - `api/` - TypeScript API server
- `/home/peterbutler/sagrada/` - Unused/legacy clone (can be removed)

## Services on Pi

| Service | Command |
|---------|---------|
| Web server | `sudo systemctl restart nginx` |
| API server | `sudo systemctl restart sagrada-api` |
| View logs | `journalctl -u sagrada-api -f` |

## Database

MySQL on sagrada.local:
- Database: `climate`
- User: `peter`
- Password: `mef9abRA`

```bash
ssh sagrada.local "mysql -u peter -p'mef9abRA' climate -e 'YOUR QUERY'"
```

## Key Files

- `web/src/utils/rateCalculation.js` - Rate calculation and formatting
- `web/src/hooks/useHistory.js` - Historical data management, rate array computation
- `web/src/components/TemperatureChart.jsx` - Chart display including rate mode
