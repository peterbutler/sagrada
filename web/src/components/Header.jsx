import React, { useState, useEffect } from 'react';
import { formatTime } from '../utils/formatting';
import { ConnectionState } from '../hooks/useWebSocket';
import { useSystemHealth } from '../hooks/useSystemHealth';

/**
 * Header component with title, status indicator, clock, and latency
 */
export function Header({ connectionState, latency }) {
  const [time, setTime] = useState(formatTime());
  const { health } = useSystemHealth(60000);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatTime());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const statusText = getStatusText(connectionState);
  const latencyText = latency !== null ? `${Math.round(latency)}ms` : '--ms';

  // Disk warning banner
  const diskPercent = health?.disk?.percent_used;
  const showDiskWarning = diskPercent >= 90;
  const isDiskCritical = diskPercent >= 95;

  return (
    <header className="header panel">
      <div className="header-left">
        <h1 className="header-title">GREENHOUSE MONITOR v2.0</h1>
      </div>
      <div className="header-right">
        {showDiskWarning && (
          <a
            href="/debug"
            style={{
              padding: '4px 8px',
              backgroundColor: isDiskCritical ? 'rgba(255,0,0,0.2)' : 'rgba(255,170,0,0.2)',
              border: `1px solid ${isDiskCritical ? 'var(--color-red)' : 'var(--color-amber)'}`,
              borderRadius: '2px',
              color: isDiskCritical ? 'var(--color-red)' : 'var(--color-amber)',
              fontSize: '11px',
              textDecoration: 'none',
              fontWeight: 600
            }}
          >
            {isDiskCritical ? '!' : '!'} DISK{isDiskCritical ? ' FULL' : ''}: {diskPercent}%
          </a>
        )}
        <div className="status-indicator">
          <span className={`status-dot ${isConnected ? '' : 'disconnected'}`} />
          <span>{statusText}</span>
        </div>
        <span className="clock">{time}</span>
        <span className="latency">{latencyText}</span>
      </div>
    </header>
  );
}

function getStatusText(connectionState) {
  switch (connectionState) {
    case ConnectionState.CONNECTED:
      return 'SYSTEM ONLINE';
    case ConnectionState.CONNECTING:
      return 'CONNECTING...';
    case ConnectionState.RECONNECTING:
      return 'RECONNECTING...';
    case ConnectionState.DISCONNECTED:
    default:
      return 'OFFLINE';
  }
}
