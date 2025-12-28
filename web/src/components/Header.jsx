import React, { useState, useEffect } from 'react';
import { formatTime } from '../utils/formatting';
import { ConnectionState } from '../hooks/useWebSocket';

/**
 * Header component with title, status indicator, clock, and latency
 */
export function Header({ connectionState, latency }) {
  const [time, setTime] = useState(formatTime());

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

  return (
    <header className="header panel">
      <div className="header-left">
        <h1 className="header-title">GREENHOUSE MONITOR v2.0</h1>
      </div>
      <div className="header-right">
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
