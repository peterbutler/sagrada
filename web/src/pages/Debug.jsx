import React, { useState, useEffect } from 'react';
import { useWebSocket, ConnectionState } from '../hooks/useWebSocket';
import { formatTimeAgo, getStalenessClass } from '../utils/formatting';
import { SystemHealth } from '../components/SystemHealth';
import { NetworkStatus } from '../components/NetworkStatus';

/**
 * Debug page showing raw WebSocket sensor data
 * No processing, conversions, or logic - just raw values
 */
export function Debug() {
  // Raw sensor data by location+metric key
  const [sensorData, setSensorData] = useState({});

  // Message log (last N messages)
  const [messageLog, setMessageLog] = useState([]);
  const MAX_LOG_SIZE = 50;

  // Stats
  const [stats, setStats] = useState({
    messagesReceived: 0,
    lastMessageTime: null,
    connectionTime: null
  });

  const handleMessage = (message) => {
    const now = new Date();

    // Update stats
    setStats(prev => ({
      ...prev,
      messagesReceived: prev.messagesReceived + 1,
      lastMessageTime: now.toISOString()
    }));

    // Add to message log
    setMessageLog(prev => {
      const newLog = [{
        receivedAt: now.toISOString(),
        ...message
      }, ...prev];
      return newLog.slice(0, MAX_LOG_SIZE);
    });

    // Update sensor data (keyed by location + metric)
    if (message.type === 'sensor_update') {
      const key = `${message.location}:${message.metric}`;
      setSensorData(prev => ({
        ...prev,
        [key]: {
          location: message.location,
          metric: message.metric,
          value: message.value,
          unit: message.unit,
          timestamp: message.timestamp,
          receivedAt: now.toISOString()
        }
      }));
    }
  };

  const { connectionState, latency } = useWebSocket({
    onMessage: handleMessage
  });

  // Track connection time
  useEffect(() => {
    if (connectionState === ConnectionState.CONNECTED) {
      setStats(prev => ({
        ...prev,
        connectionTime: new Date().toISOString()
      }));
    }
  }, [connectionState]);

  // Tick every 100ms to update "time ago" displays
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(interval);
  }, []);

  // Sort sensor data for display
  const sortedSensors = Object.values(sensorData).sort((a, b) => {
    if (a.location !== b.location) return a.location.localeCompare(b.location);
    return a.metric.localeCompare(b.metric);
  });

  // Group by location
  const groupedByLocation = sortedSensors.reduce((acc, sensor) => {
    if (!acc[sensor.location]) acc[sensor.location] = [];
    acc[sensor.location].push(sensor);
    return acc;
  }, {});

  const connectionColor = {
    [ConnectionState.CONNECTED]: '#00ff00',
    [ConnectionState.CONNECTING]: '#ffaa00',
    [ConnectionState.RECONNECTING]: '#ffaa00',
    [ConnectionState.DISCONNECTED]: '#ff0000'
  }[connectionState] || '#888';

  return (
    <div style={{
      backgroundColor: '#000',
      color: '#00ff00',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '12px',
      padding: '20px',
      minHeight: '100vh'
    }}>
      <h1 style={{ margin: '0 0 20px 0', fontSize: '16px' }}>
        WEBSOCKET DEBUG
      </h1>

      {/* Connection Status */}
      <div style={{
        marginBottom: '20px',
        padding: '12px',
        border: '1px solid #333',
        backgroundColor: '#0a0a0a'
      }}>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ color: '#888' }}>Connection: </span>
          <span style={{ color: connectionColor }}>{connectionState.toUpperCase()}</span>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ color: '#888' }}>Latency: </span>
          <span>{latency !== null ? `${latency}ms` : '--'}</span>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ color: '#888' }}>Connected at: </span>
          <span>{stats.connectionTime || '--'}</span>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ color: '#888' }}>Messages received: </span>
          <span>{stats.messagesReceived}</span>
        </div>
        <div>
          <span style={{ color: '#888' }}>Last message: </span>
          <span>{stats.lastMessageTime || '--'}</span>
        </div>
      </div>

      {/* System Health */}
      <SystemHealth />

      {/* Network Status */}
      <NetworkStatus sensorData={sensorData} />

      {/* Current Sensor Values */}
      <h2 style={{ margin: '20px 0 10px 0', fontSize: '14px', color: '#888' }}>
        CURRENT VALUES ({Object.keys(sensorData).length} sensors)
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        {Object.entries(groupedByLocation).map(([location, sensors]) => {
          // Get staleness from MOST RECENT sensor in group (using actual reading timestamp)
          const mostRecentSensor = sensors.reduce((newest, sensor) => {
            if (!newest) return sensor;
            const newestTime = new Date(newest.timestamp).getTime();
            const sensorTime = new Date(sensor.timestamp).getTime();
            return sensorTime > newestTime ? sensor : newest;
          }, null);
          const cardStalenessClass = getStalenessClass(mostRecentSensor?.timestamp);

          const stalenessColors = {
            'stale-fresh': { border: '#00ff00', bg: '#001a00' },
            'stale-warning': { border: '#ffaa00', bg: '#1a1500' },
            'stale-old': { border: '#ff0000', bg: '#1a0000' },
            'stale-unknown': { border: '#333', bg: '#0a0a0a' }
          };
          const cardColors = stalenessColors[cardStalenessClass] || stalenessColors['stale-unknown'];

          return (
            <div key={location} style={{
              padding: '12px',
              border: `1px solid ${cardColors.border}`,
              backgroundColor: cardColors.bg
            }}>
              <div style={{
                marginBottom: '8px'
              }}>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 'bold',
                  color: '#ffaa00'
                }}>
                  {location}
                </span>
              </div>
              {sensors.map((sensor) => {
                // Use actual reading timestamp for staleness, not when we received it
                const sensorStaleness = getStalenessClass(sensor.timestamp);
                const sensorColors = stalenessColors[sensorStaleness] || stalenessColors['stale-unknown'];
                const sensorTimeAgo = formatTimeAgo(sensor.timestamp);

                return (
                  <div key={sensor.metric} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                    fontSize: '11px',
                    padding: '2px 4px',
                    backgroundColor: sensorColors.bg,
                    borderLeft: `2px solid ${sensorColors.border}`
                  }}>
                    <span style={{ color: '#888' }}>{sensor.metric}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>
                        <span style={{ color: '#00ff00' }}>
                          {typeof sensor.value === 'boolean'
                            ? (sensor.value ? 'TRUE' : 'FALSE')
                            : typeof sensor.value === 'number'
                              ? sensor.value.toFixed(4)
                              : String(sensor.value)}
                        </span>
                        {sensor.unit && (
                          <span style={{ color: '#666', marginLeft: '4px' }}>
                            {sensor.unit}
                          </span>
                        )}
                      </span>
                      <span style={{
                        color: sensorColors.border,
                        fontSize: '9px',
                        fontVariantNumeric: 'tabular-nums',
                        minWidth: '45px',
                        textAlign: 'right'
                      }}>
                        {sensorTimeAgo}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Message Log */}
      <h2 style={{ margin: '20px 0 10px 0', fontSize: '14px', color: '#888' }}>
        MESSAGE LOG (last {MAX_LOG_SIZE})
      </h2>
      <div style={{
        padding: '12px',
        border: '1px solid #333',
        backgroundColor: '#0a0a0a',
        maxHeight: '400px',
        overflowY: 'auto'
      }}>
        {messageLog.length === 0 ? (
          <div style={{ color: '#444' }}>Waiting for messages...</div>
        ) : (
          messageLog.map((msg, i) => (
            <div key={i} style={{
              marginBottom: '8px',
              paddingBottom: '8px',
              borderBottom: '1px solid #222',
              fontSize: '10px'
            }}>
              <div style={{ color: '#666', marginBottom: '2px' }}>
                {msg.receivedAt}
              </div>
              <pre style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: '#00ff00'
              }}>
                {JSON.stringify(msg, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>

      {/* Back link */}
      <div style={{ marginTop: '20px' }}>
        <a href="/" style={{ color: '#0088ff' }}>← Back to Dashboard</a>
      </div>
    </div>
  );
}
