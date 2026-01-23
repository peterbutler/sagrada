import React from 'react';
import { formatTimeAgo, getStalenessClass } from '../utils/formatting';

/**
 * Get network state label and color.
 */
function getStateInfo(stateValue) {
  switch (stateValue) {
    case 0:
      return { label: 'HEALTHY', color: 'var(--color-green)', bgColor: '#001a00' };
    case 1:
      return { label: 'DEGRADED', color: 'var(--color-amber)', bgColor: '#1a1500' };
    case 2:
      return { label: 'DOWN', color: 'var(--color-red)', bgColor: '#1a0000' };
    default:
      return { label: 'UNKNOWN', color: 'var(--color-gray)', bgColor: '#0a0a0a' };
  }
}

/**
 * Get latency color based on value.
 */
function getLatencyColor(latencyMs) {
  if (latencyMs === null || latencyMs === undefined) return 'var(--color-gray)';
  if (latencyMs < 20) return 'var(--color-green)';
  if (latencyMs < 100) return 'var(--color-amber)';
  return 'var(--color-red)';
}

/**
 * NetworkStatus component - displays network connectivity status.
 * Expects sensorData object with keys like "network:state", "network:gateway_latency", etc.
 * (The API parses shed/system/network/state → location="network", metric="state")
 */
export function NetworkStatus({ sensorData }) {
  // Extract network metrics from sensor data
  const networkPrefix = 'network:';

  const getMetric = (metric) => {
    const key = `${networkPrefix}${metric}`;
    return sensorData[key] || null;
  };

  const stateData = getMetric('state');
  const gatewayLatencyData = getMetric('gateway_latency');
  const internetLatencyData = getMetric('internet_latency');
  const failuresData = getMetric('failures');

  // Get values
  const stateValue = stateData?.value;
  const gatewayLatency = gatewayLatencyData?.value;
  const internetLatency = internetLatencyData?.value;
  const failures = failuresData?.value ?? 0;

  // Get most recent timestamp for staleness
  const timestamps = [stateData?.timestamp, gatewayLatencyData?.timestamp, internetLatencyData?.timestamp, failuresData?.timestamp]
    .filter(Boolean)
    .map(t => new Date(t).getTime());
  const mostRecentTimestamp = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

  const stateInfo = getStateInfo(stateValue);
  const hasData = stateData !== null;

  // Staleness styling
  const stalenessClass = getStalenessClass(mostRecentTimestamp);
  const stalenessColors = {
    'stale-fresh': { border: 'var(--color-green)', text: 'var(--color-green)' },
    'stale-warning': { border: 'var(--color-amber)', text: 'var(--color-amber)' },
    'stale-old': { border: 'var(--color-red)', text: 'var(--color-red)' },
    'stale-unknown': { border: 'var(--color-gray)', text: 'var(--color-gray)' }
  };
  const staleness = stalenessColors[stalenessClass] || stalenessColors['stale-unknown'];

  return (
    <section className="panel" style={{ marginBottom: '20px' }}>
      <div className="panel-header">
        <span className="panel-icon">
          {stateValue === 2 ? '!' : stateValue === 1 ? '!' : ''}
        </span>
        <span className="panel-title">Network Status</span>

        {hasData && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '11px',
            color: stateInfo.color,
            fontWeight: 600
          }}>
            {stateInfo.label}
          </span>
        )}
      </div>

      {!hasData ? (
        <div style={{ color: 'var(--color-gray)', fontSize: '12px' }}>
          Waiting for network data...
        </div>
      ) : (
        <>
          {/* Status indicator bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: stateInfo.bgColor,
            border: `1px solid ${stateInfo.color}`,
            borderRadius: 'var(--border-radius)'
          }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: stateInfo.color,
              boxShadow: `0 0 8px ${stateInfo.color}`
            }} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: stateInfo.color
              }}>
                {stateInfo.label}
              </div>
              {failures > 0 && (
                <div style={{
                  fontSize: '11px',
                  color: 'var(--color-amber)',
                  marginTop: '2px'
                }}>
                  {failures} consecutive failure{failures !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>

          {/* Latency metrics */}
          <div style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            {/* Gateway latency */}
            <div style={{
              flex: 1,
              minWidth: '120px',
              padding: '10px',
              backgroundColor: 'var(--color-black)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--border-radius)'
            }}>
              <span style={{
                fontSize: '10px',
                color: 'var(--color-gray)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                display: 'block',
                marginBottom: '6px'
              }}>
                Gateway Latency
              </span>
              <span style={{
                fontSize: '16px',
                fontWeight: 600,
                color: getLatencyColor(gatewayLatency)
              }}>
                {gatewayLatency !== null && gatewayLatency !== undefined
                  ? `${gatewayLatency.toFixed(1)} ms`
                  : '--'}
              </span>
            </div>

            {/* Internet latency */}
            <div style={{
              flex: 1,
              minWidth: '120px',
              padding: '10px',
              backgroundColor: 'var(--color-black)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--border-radius)'
            }}>
              <span style={{
                fontSize: '10px',
                color: 'var(--color-gray)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                display: 'block',
                marginBottom: '6px'
              }}>
                Internet Latency
              </span>
              <span style={{
                fontSize: '16px',
                fontWeight: 600,
                color: getLatencyColor(internetLatency)
              }}>
                {internetLatency !== null && internetLatency !== undefined
                  ? `${internetLatency.toFixed(1)} ms`
                  : '--'}
              </span>
            </div>

            {/* Failure count */}
            <div style={{
              flex: 1,
              minWidth: '120px',
              padding: '10px',
              backgroundColor: 'var(--color-black)',
              border: `1px solid ${failures > 0 ? 'var(--color-amber)' : 'var(--color-border)'}`,
              borderRadius: 'var(--border-radius)'
            }}>
              <span style={{
                fontSize: '10px',
                color: 'var(--color-gray)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                display: 'block',
                marginBottom: '6px'
              }}>
                Failures
              </span>
              <span style={{
                fontSize: '16px',
                fontWeight: 600,
                color: failures > 0 ? 'var(--color-amber)' : 'var(--color-green)'
              }}>
                {failures}
              </span>
            </div>
          </div>

          {/* Last updated */}
          {mostRecentTimestamp && (
            <div style={{
              marginTop: '12px',
              fontSize: '10px',
              color: staleness.text,
              textAlign: 'right'
            }}>
              Last updated: {formatTimeAgo(mostRecentTimestamp)}
            </div>
          )}
        </>
      )}
    </section>
  );
}
