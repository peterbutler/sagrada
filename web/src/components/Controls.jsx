import React, { useState, useCallback, useEffect } from 'react';
import { setTargetTemperature, turnOffTarget, setDeviceState } from '../api/client';

const TEMP_PRESETS = [65, 68, 70, 72];
const DURATION_PRESETS = [
  { label: '1 Hour', hours: 1 },
  { label: '2 Hours', hours: 2 },
  { label: '4 Hours', hours: 4 },
  { label: '8 Hours', hours: 8 },
  { label: 'Until Tomorrow', hours: 12 }
];

/**
 * Controls component for temperature and device control
 */
export function Controls({
  targetTemp,
  devices,
  onTargetChange,
  onDeviceChange
}) {
  const [localTarget, setLocalTarget] = useState(targetTemp || 70);
  const [duration, setDuration] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Track pending device states: { [device]: expectedState }
  const [pendingDevices, setPendingDevices] = useState({});

  // Update local target when prop changes
  React.useEffect(() => {
    if (targetTemp !== null && targetTemp !== undefined) {
      setLocalTarget(targetTemp);
    }
  }, [targetTemp]);

  // Clear pending state when device state matches expected
  useEffect(() => {
    const stillPending = {};
    for (const [device, expectedState] of Object.entries(pendingDevices)) {
      const actualState = devices[device]?.state;
      if (actualState !== expectedState) {
        stillPending[device] = expectedState;
      }
    }
    // Only update if something changed
    if (Object.keys(stillPending).length !== Object.keys(pendingDevices).length) {
      setPendingDevices(stillPending);
    }
  }, [devices, pendingDevices]);

  const handleIncrement = () => {
    setLocalTarget(prev => Math.min(90, prev + 1));
  };

  const handleDecrement = () => {
    setLocalTarget(prev => Math.max(50, prev - 1));
  };

  const handlePreset = useCallback(async (temp) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await setTargetTemperature(temp, duration);
      setLocalTarget(temp);
      onTargetChange?.(temp);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [duration, onTargetChange]);

  const handleOff = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await turnOffTarget();
      onTargetChange?.(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [onTargetChange]);

  const handleDuration = (hours) => {
    setDuration(hours);
  };

  const handleApplyTarget = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await setTargetTemperature(localTarget, duration);
      onTargetChange?.(localTarget);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [localTarget, duration, onTargetChange]);

  const handleDeviceToggle = useCallback(async (device) => {
    // Use pending state if exists, otherwise current state
    const currentState = pendingDevices[device] ?? devices[device]?.state ?? false;
    const newState = !currentState;

    // Immediately show pending state
    setPendingDevices(prev => ({ ...prev, [device]: newState }));
    setError(null);

    try {
      await setDeviceState(device, newState);
      onDeviceChange?.(device, newState);
    } catch (err) {
      setError(err.message);
      // Revert pending state on error
      setPendingDevices(prev => {
        const next = { ...prev };
        delete next[device];
        return next;
      });
    }
  }, [devices, pendingDevices, onDeviceChange]);

  const isOff = targetTemp === null || targetTemp === undefined || targetTemp === 0;
  const tempDisplay = isOff ? 'OFF' : `${localTarget}°F`;

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-icon">🎛️</span>
        <span className="panel-title">Controls</span>
      </div>

      {error && (
        <div style={{ color: 'var(--color-red)', marginBottom: '12px', fontSize: '11px' }}>
          Error: {error}
        </div>
      )}

      <div className="controls-section">
        <div className="control-group">
          <span className="control-label">Workspace Target Temperature</span>
          <div className="temp-control">
            <button
              className="temp-btn"
              onClick={handleDecrement}
              disabled={isSubmitting || isOff}
            >
              -
            </button>
            <span className={`temp-display ${isOff ? 'off' : ''}`}>
              {tempDisplay}
            </span>
            <button
              className="temp-btn"
              onClick={handleIncrement}
              disabled={isSubmitting || isOff}
            >
              +
            </button>
            <button
              className="preset-btn"
              onClick={handleApplyTarget}
              disabled={isSubmitting || isOff}
              style={{ marginLeft: '8px' }}
            >
              Apply
            </button>
          </div>
          <div className="preset-buttons" style={{ marginTop: '8px' }}>
            {TEMP_PRESETS.map((temp) => (
              <button
                key={temp}
                className={`preset-btn ${targetTemp === temp ? 'active' : ''}`}
                onClick={() => handlePreset(temp)}
                disabled={isSubmitting}
              >
                {temp}°F
              </button>
            ))}
            <button
              className={`preset-btn ${isOff ? 'active' : ''}`}
              onClick={handleOff}
              disabled={isSubmitting}
            >
              OFF
            </button>
          </div>
        </div>

        <div className="control-group">
          <span className="control-label">Duration Override</span>
          <div className="preset-buttons">
            {DURATION_PRESETS.map(({ label, hours }) => (
              <button
                key={hours}
                className={`preset-btn ${duration === hours ? 'active' : ''}`}
                onClick={() => handleDuration(hours)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <span className="control-label">Manual Override</span>
          <div className="device-toggles">
            {['heater', 'pump', 'fan'].map((device) => {
              const isPending = device in pendingDevices;
              const displayState = isPending ? pendingDevices[device] : devices[device]?.state;
              const label = device.charAt(0).toUpperCase() + device.slice(1);

              return (
                <button
                  key={device}
                  className={`device-btn ${displayState ? 'on' : ''} ${isPending ? 'pending' : ''}`}
                  onClick={() => handleDeviceToggle(device)}
                  disabled={isPending}
                >
                  {label}: {displayState ? 'ON' : 'OFF'}
                  {isPending && '...'}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
