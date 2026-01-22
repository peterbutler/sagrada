# Move System Health Panel to Debug Page

## Overview

Move the detailed SystemHealth panel from the Dashboard to the Debug page, and add a minimal disk warning banner to the main Dashboard header that only appears when disk usage exceeds 90%.

---

## Changes

### 1. Add SystemHealth to Debug Page

**File:** `web/src/pages/Debug.jsx`

- Import SystemHealth component
- Add SystemHealth panel after the Connection Status section
- Fits naturally with the debug/diagnostic nature of the page

### 2. Remove SystemHealth from Dashboard

**File:** `web/src/pages/Dashboard.jsx`

- Remove import for SystemHealth
- Remove `<SystemHealth />` component from render

### 3. Add Disk Warning Banner to Header

**File:** `web/src/components/Header.jsx`

- Import useSystemHealth hook
- Add conditional banner that appears only when disk usage >= 90%
- Banner styling:
  - **90-94%**: Yellow/amber warning (`var(--color-amber)`)
  - **95%+**: Red critical (`var(--color-red)`)
- Compact display: just shows "DISK: 92%" or "DISK FULL: 96%"
- Links to /debug for full details

**Example UI:**
```
┌─────────────────────────────────────────────────────────────────┐
│ GREENHOUSE MONITOR v2.0    [⚠ DISK: 92%]    ● ONLINE  12:34  5ms │
└─────────────────────────────────────────────────────────────────┘
```

When critical:
```
┌─────────────────────────────────────────────────────────────────┐
│ GREENHOUSE MONITOR v2.0    [! DISK FULL: 96%]  ● ONLINE  12:34  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### Header Banner Component

```jsx
// Inside Header.jsx
const { health } = useSystemHealth(60000);

const diskPercent = health?.disk?.percent_used;
const showWarning = diskPercent >= 90;
const isCritical = diskPercent >= 95;

{showWarning && (
  <a href="/debug" style={{
    padding: '4px 8px',
    backgroundColor: isCritical ? 'rgba(255,0,0,0.2)' : 'rgba(255,170,0,0.2)',
    border: `1px solid ${isCritical ? 'var(--color-red)' : 'var(--color-amber)'}`,
    borderRadius: '2px',
    color: isCritical ? 'var(--color-red)' : 'var(--color-amber)',
    fontSize: '11px',
    textDecoration: 'none'
  }}>
    {isCritical ? '!' : '⚠'} DISK{isCritical ? ' FULL' : ''}: {diskPercent}%
  </a>
)}
```

### Thresholds

| Disk Usage | Banner | Color | Behavior |
|------------|--------|-------|----------|
| < 90% | Hidden | - | Normal operation |
| 90-94% | Warning | Amber | Show warning, writes still work |
| >= 95% | Critical | Red | Show "DISK FULL", writes blocked |

---

## Tasks

1. [ ] Update `web/src/pages/Debug.jsx` - add SystemHealth import and component
2. [ ] Update `web/src/pages/Dashboard.jsx` - remove SystemHealth import and component
3. [ ] Update `web/src/components/Header.jsx` - add useSystemHealth and conditional banner
4. [ ] Test locally
5. [ ] Deploy to Pi

---

## Notes

- The useSystemHealth hook already refreshes every 60 seconds, so the banner will stay current
- Banner links to /debug so users can see full details
- No new API changes needed - reuses existing /api/system/health endpoint
