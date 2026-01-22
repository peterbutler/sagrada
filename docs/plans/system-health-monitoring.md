# System Health Monitoring Implementation Plan

This plan covers two workstreams to prevent and detect disk space issues:

1. **Dashboard Monitoring** - Visibility into disk usage and table sizes
2. **Graceful Degradation** - Services stop writing when disk is critically full

---

## Workstream 1: Dashboard Monitoring

### Goal
Add a System Health panel to the dashboard showing disk usage and database table sizes with visual indicators.

### API Changes

#### New Endpoints

**GET /api/system/health**
```typescript
{
  success: true,
  data: {
    disk: {
      used_bytes: 10737418240,
      total_bytes: 16106127360,
      available_bytes: 3758096384,
      percent_used: 76,
      status: "ok" | "warning" | "critical"
    },
    tables: [
      {
        name: "sensor_readings",
        data_mb: 328,
        index_mb: 0,
        total_mb: 328,
        rows: 3854501,
        status: "ok" | "warning" | "critical"
      },
      {
        name: "minute_readings",
        data_mb: 920,
        index_mb: 3293,
        total_mb: 4213,
        rows: 8241317,
        status: "ok"
      }
    ],
    timestamp: "2026-01-21T19:15:00.000Z"
  }
}
```

**Status Thresholds:**
| Metric | OK | Warning | Critical |
|--------|-----|---------|----------|
| Disk % | <80% | 80-94% | ≥95% |
| sensor_readings rows | <2M | 2-5M | >5M |

#### Implementation Files

1. **api/src/routes/system.ts** (new)
   - GET `/health` endpoint
   - Calls service functions

2. **api/src/services/system.ts** (new)
   - `getDiskUsage()`: Execute `df` command, parse output
   - `getTableSizes()`: Query `information_schema.tables`
   - `getSystemHealth()`: Combine both with status calculation

3. **api/src/routes/index.ts** (modify)
   - Add `router.use('/system', systemRouter)`

#### Service Implementation

```typescript
// api/src/services/system.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import { query } from '../db/index.js';

const execAsync = promisify(exec);

interface DiskUsage {
  used_bytes: number;
  total_bytes: number;
  available_bytes: number;
  percent_used: number;
  status: 'ok' | 'warning' | 'critical';
}

interface TableSize {
  name: string;
  data_mb: number;
  index_mb: number;
  total_mb: number;
  rows: number;
  status: 'ok' | 'warning' | 'critical';
}

// Thresholds
const DISK_WARNING_PERCENT = 80;
const DISK_CRITICAL_PERCENT = 95;
const SENSOR_READINGS_WARNING_ROWS = 2_000_000;
const SENSOR_READINGS_CRITICAL_ROWS = 5_000_000;

export async function getDiskUsage(): Promise<DiskUsage> {
  const { stdout } = await execAsync("df -B1 / | tail -1 | awk '{print $2,$3,$4,$5}'");
  const [total, used, available, percentStr] = stdout.trim().split(/\s+/);
  const percent = parseInt(percentStr.replace('%', ''), 10);

  let status: 'ok' | 'warning' | 'critical' = 'ok';
  if (percent >= DISK_CRITICAL_PERCENT) status = 'critical';
  else if (percent >= DISK_WARNING_PERCENT) status = 'warning';

  return {
    total_bytes: parseInt(total, 10),
    used_bytes: parseInt(used, 10),
    available_bytes: parseInt(available, 10),
    percent_used: percent,
    status,
  };
}

export async function getTableSizes(): Promise<TableSize[]> {
  const sql = `
    SELECT
      table_name as name,
      ROUND(data_length / 1024 / 1024, 0) as data_mb,
      ROUND(index_length / 1024 / 1024, 0) as index_mb,
      ROUND((data_length + index_length) / 1024 / 1024, 0) as total_mb,
      table_rows as rows
    FROM information_schema.tables
    WHERE table_schema = 'climate'
      AND table_name IN ('sensor_readings', 'minute_readings', 'thermostat')
    ORDER BY (data_length + index_length) DESC
  `;

  const results = await query<TableSize[]>(sql);

  return results.map(table => {
    let status: 'ok' | 'warning' | 'critical' = 'ok';

    if (table.name === 'sensor_readings') {
      if (table.rows > SENSOR_READINGS_CRITICAL_ROWS) status = 'critical';
      else if (table.rows > SENSOR_READINGS_WARNING_ROWS) status = 'warning';
    }

    return { ...table, status };
  });
}

export async function getSystemHealth() {
  const [disk, tables] = await Promise.all([
    getDiskUsage(),
    getTableSizes(),
  ]);

  return {
    disk,
    tables,
    timestamp: new Date().toISOString(),
  };
}
```

### Dashboard Changes

#### New Component: SystemHealth.jsx

Location: `web/src/components/SystemHealth.jsx`

Features:
- Disk usage bar with percentage and color coding
- Table size cards showing MB and row counts
- Auto-refresh every 60 seconds
- Expandable/collapsible (default collapsed to save space)

```jsx
// Mockup structure
<SystemHealth>
  <DiskUsageBar
    percent={76}
    used="10.0 GB"
    total="15 GB"
    status="ok"
  />
  <TableSizeGrid>
    <TableCard
      name="sensor_readings"
      size="328 MB"
      rows="3.9M"
      status="ok"
    />
    <TableCard
      name="minute_readings"
      size="4.1 GB"
      rows="8.2M"
      status="ok"
    />
  </TableSizeGrid>
</SystemHealth>
```

#### Dashboard Integration

Location: `web/src/components/Dashboard.jsx`

- Add SystemHealth component below existing panels
- Or: Add to Header as a status indicator icon that expands on click

#### New Hook: useSystemHealth.js

```javascript
// web/src/hooks/useSystemHealth.js
export function useSystemHealth(refreshInterval = 60000) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/system/health');
      const data = await response.json();
      if (data.success) {
        setHealth(data.data);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  return { health, loading, error, refresh };
}
```

### Tasks

1. [ ] Create `api/src/services/system.ts` with disk and table size functions
2. [ ] Create `api/src/routes/system.ts` with GET /health endpoint
3. [ ] Register route in `api/src/routes/index.ts`
4. [ ] Create `web/src/hooks/useSystemHealth.js`
5. [ ] Create `web/src/components/SystemHealth.jsx`
6. [ ] Add SystemHealth to Dashboard.jsx
7. [ ] Test locally
8. [ ] Deploy to Pi

---

## Workstream 2: Graceful Degradation

### Goal
Services should refuse to write data when disk usage exceeds 95%, logging clear errors instead of failing with cryptic MySQL errors.

### Design

#### Disk Check Utility

Create a shared utility that services can use to check disk status before writing:

```python
# services/sagrada/shared/disk_check.py

import shutil
import logging

logger = logging.getLogger(__name__)

CRITICAL_THRESHOLD_PERCENT = 95

class DiskFullError(Exception):
    """Raised when disk is too full to safely write data."""
    pass

def get_disk_usage(path: str = "/") -> tuple[int, int, float]:
    """Get disk usage for the given path.

    Returns:
        Tuple of (used_bytes, total_bytes, percent_used)
    """
    usage = shutil.disk_usage(path)
    percent = (usage.used / usage.total) * 100
    return usage.used, usage.total, percent

def check_disk_space(path: str = "/", threshold: float = CRITICAL_THRESHOLD_PERCENT) -> bool:
    """Check if disk has enough space to continue writing.

    Args:
        path: Filesystem path to check
        threshold: Percentage threshold above which writes should stop

    Returns:
        True if safe to write, False if disk is too full
    """
    _, _, percent = get_disk_usage(path)
    return percent < threshold

def require_disk_space(path: str = "/", threshold: float = CRITICAL_THRESHOLD_PERCENT):
    """Raise DiskFullError if disk is above threshold.

    Use this as a guard before write operations.
    """
    used, total, percent = get_disk_usage(path)
    if percent >= threshold:
        used_gb = used / (1024**3)
        total_gb = total / (1024**3)
        raise DiskFullError(
            f"Disk usage critical: {percent:.1f}% ({used_gb:.1f}/{total_gb:.1f} GB). "
            f"Writes suspended until usage drops below {threshold}%."
        )
```

#### Integration Points

**1. Collector Service** (`services/sagrada/collector/collector.py`)

Before storing readings:
```python
from sagrada.shared.disk_check import require_disk_space, DiskFullError

def store_readings(self, readings: List[Reading]):
    try:
        require_disk_space()
    except DiskFullError as e:
        logger.error(f"Cannot store readings: {e}")
        return 0  # Return 0 readings stored

    # ... existing store logic
```

**2. Aggregator Service** (`services/sagrada/aggregator/aggregator.py`)

Before aggregation:
```python
from sagrada.shared.disk_check import require_disk_space, DiskFullError

def aggregate(self, start_time: datetime, end_time: datetime) -> int:
    try:
        require_disk_space()
    except DiskFullError as e:
        logger.error(f"Cannot aggregate: {e}")
        return 0

    # ... existing aggregation logic
```

**3. MQTT Logger** (`services/sagrada/mqtt_logger/`)

Before writing to database:
```python
from sagrada.shared.disk_check import check_disk_space

# In message handler
if not check_disk_space():
    logger.warning("Disk full - skipping message persistence")
    return

# ... existing write logic
```

### Behavior When Disk Full

| Service | Behavior | Recovery |
|---------|----------|----------|
| Collector | Logs error, skips storing, continues collecting | Auto-resumes when disk < 95% |
| Aggregator | Logs error, skips cycle, continues running | Auto-resumes when disk < 95% |
| MQTT Logger | Logs warning, skips persistence | Auto-resumes when disk < 95% |
| Controller | Unaffected (reads only) | N/A |
| API Server | Unaffected (reads only) | N/A |

### Log Messages

When disk is full, services will log:
```
2026-01-21 14:13:00 - sagrada.collector - ERROR - Cannot store readings: Disk usage critical: 96.2% (14.5/15.0 GB). Writes suspended until usage drops below 95%.
```

This is much clearer than:
```
ERROR - Error storing readings: (1114, "The table 'sensor_readings' is full")
```

### Tasks

1. [ ] Create `services/sagrada/shared/disk_check.py`
2. [ ] Add disk check to `services/sagrada/shared/database.py` (ReadingsStorage.store_readings)
3. [ ] Add disk check to `services/sagrada/aggregator/aggregator.py` (aggregate method)
4. [ ] Add disk check to MQTT logger message handler
5. [ ] Test with simulated full disk (lower threshold temporarily)
6. [ ] Deploy to Pi

---

## Implementation Order

**Phase 1: Graceful Degradation (Immediate protection)**
1. Create disk_check.py utility
2. Integrate into collector (highest write volume)
3. Integrate into aggregator
4. Deploy and verify

**Phase 2: Dashboard Monitoring (Visibility)**
1. Create API endpoint
2. Create dashboard component
3. Deploy and verify

---

## Testing

### Graceful Degradation Testing

1. Temporarily set threshold to current usage + 1%
2. Verify services log errors but keep running
3. Verify no data corruption
4. Restore threshold, verify auto-recovery

### Dashboard Testing

1. Verify endpoint returns correct data
2. Verify status thresholds work correctly
3. Verify dashboard displays and auto-refreshes
4. Test with warning/critical states

---

## Future Enhancements

- **Alerting**: Send notification (email/webhook) when status changes to warning/critical
- **Historical tracking**: Store disk/table stats over time for trend analysis
- **Auto-remediation**: Trigger cleanup job when approaching warning threshold
- **minute_readings retention**: Add configurable retention policy (currently unbounded)
