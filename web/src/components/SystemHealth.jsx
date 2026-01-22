import React from 'react';
import { useSystemHealth } from '../hooks/useSystemHealth';

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format large numbers with K/M suffix.
 */
function formatRows(rows) {
  if (rows >= 1_000_000) {
    return (rows / 1_000_000).toFixed(1) + 'M';
  }
  if (rows >= 1_000) {
    return (rows / 1_000).toFixed(0) + 'K';
  }
  return rows.toString();
}

/**
 * Get CSS class for status.
 */
function getStatusClass(status) {
  switch (status) {
    case 'critical':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'ok';
  }
}

/**
 * Get CSS color variable for status.
 */
function getStatusColor(status) {
  switch (status) {
    case 'critical':
      return 'var(--color-red)';
    case 'warning':
      return 'var(--color-amber)';
    default:
      return 'var(--color-green)';
  }
}

/**
 * DiskUsageBar component - displays disk usage as a progress bar.
 */
function DiskUsageBar({ disk }) {
  if (!disk) return null;

  const barColor = getStatusColor(disk.status);

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px'
      }}>
        <span style={{
          fontSize: '11px',
          color: 'var(--color-gray)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Disk Usage
        </span>
        <span style={{
          fontSize: '12px',
          color: barColor,
          fontWeight: 600
        }}>
          {disk.percent_used}%
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        height: '8px',
        backgroundColor: 'var(--color-black)',
        border: '1px solid var(--color-border)',
        borderRadius: '4px',
        overflow: 'hidden'
      }}>
        <div style={{
          height: '100%',
          width: `${disk.percent_used}%`,
          backgroundColor: barColor,
          transition: 'width 0.3s ease'
        }} />
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '4px',
        fontSize: '10px',
        color: 'var(--color-gray)'
      }}>
        <span>{formatBytes(disk.used_bytes)} used</span>
        <span>{formatBytes(disk.available_bytes)} free</span>
        <span>{formatBytes(disk.total_bytes)} total</span>
      </div>
    </div>
  );
}

/**
 * TableCard component - displays info about a database table.
 */
function TableCard({ table }) {
  const statusColor = getStatusColor(table.status);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      padding: '10px',
      backgroundColor: 'var(--color-black)',
      border: `1px solid ${table.status !== 'ok' ? statusColor : 'var(--color-border)'}`,
      borderRadius: 'var(--border-radius)',
      flex: 1,
      minWidth: '140px'
    }}>
      <span style={{
        fontSize: '10px',
        color: 'var(--color-gray)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '6px'
      }}>
        {table.name}
      </span>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline'
      }}>
        <span style={{
          fontSize: '16px',
          fontWeight: 600,
          color: statusColor
        }}>
          {table.total_mb} MB
        </span>
        <span style={{
          fontSize: '11px',
          color: 'var(--color-gray)'
        }}>
          {formatRows(table.rows)} rows
        </span>
      </div>

      {table.index_mb > 0 && (
        <span style={{
          fontSize: '9px',
          color: 'var(--color-dark-gray)',
          marginTop: '4px'
        }}>
          Data: {table.data_mb} MB / Index: {table.index_mb} MB
        </span>
      )}
    </div>
  );
}

/**
 * SystemHealth component - displays disk and database health.
 */
export function SystemHealth() {
  const { health, loading, error, refresh } = useSystemHealth(60000);

  // Get overall status (worst of disk + tables)
  const getOverallStatus = () => {
    if (!health) return 'ok';

    const statuses = [health.disk?.status, ...(health.tables?.map(t => t.status) || [])];

    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('warning')) return 'warning';
    return 'ok';
  };

  const overallStatus = getOverallStatus();

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-icon">
          {overallStatus === 'critical' ? '!' : overallStatus === 'warning' ? '!' : ''}
        </span>
        <span className="panel-title">System Health</span>

        {!loading && health && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '11px',
            color: getStatusColor(overallStatus),
            fontWeight: 600
          }}>
            {overallStatus.toUpperCase()}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ color: 'var(--color-gray)', fontSize: '12px' }}>
          Loading...
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--color-red)', fontSize: '12px' }}>
          Error: {error}
        </div>
      )}

      {!loading && !error && health && (
        <>
          <DiskUsageBar disk={health.disk} />

          <div style={{
            fontSize: '11px',
            color: 'var(--color-gray)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px'
          }}>
            Database Tables
          </div>

          <div style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            {health.tables?.map((table) => (
              <TableCard key={table.name} table={table} />
            ))}
          </div>

          <div style={{
            marginTop: '12px',
            fontSize: '10px',
            color: 'var(--color-dark-gray)',
            textAlign: 'right'
          }}>
            Last updated: {new Date(health.timestamp).toLocaleTimeString()}
            <button
              onClick={refresh}
              style={{
                marginLeft: '8px',
                fontSize: '10px',
                padding: '2px 6px',
                background: 'transparent',
                border: '1px solid var(--color-gray)',
                color: 'var(--color-gray)',
                borderRadius: '2px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)'
              }}
            >
              Refresh
            </button>
          </div>
        </>
      )}
    </section>
  );
}
