import React, { useState, useEffect, useCallback } from 'react';
import { getNextSchedule, scheduleHeat, cancelNextSchedule } from '../api/client';
import { formatScheduledTime } from '../utils/formatting';

/**
 * Schedule component for managing heating schedules
 */
export function Schedule() {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch current schedule
  const fetchSchedule = useCallback(async () => {
    try {
      const result = await getNextSchedule();
      if (result.success && result.scheduled) {
        setSchedule({
          id: result.id,
          startTime: result.start_time,
          endTime: result.end_time,
          temperature: result.temperature
        });
      } else {
        setSchedule(null);
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
    // Refresh every minute
    const interval = setInterval(fetchSchedule, 60000);
    return () => clearInterval(interval);
  }, [fetchSchedule]);

  const handleScheduleTomorrow = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Schedule for tomorrow at 7:30 AM local time
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(7, 30, 0, 0);

      await scheduleHeat(tomorrow.toISOString(), 4, 70);
      await fetchSchedule();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [fetchSchedule]);

  const handleCancel = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await cancelNextSchedule();
      setSchedule(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const formatScheduleInfo = () => {
    if (!schedule) {
      return 'No scheduled heating events';
    }

    const start = formatScheduledTime(schedule.startTime);
    const end = formatScheduledTime(schedule.endTime);

    return `Next Heat: ${start} → ${end} @ ${schedule.temperature}°F`;
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-icon">📅</span>
        <span className="panel-title">Schedule</span>
      </div>

      {error && (
        <div style={{ color: 'var(--color-red)', marginBottom: '12px', fontSize: '11px' }}>
          Error: {error}
        </div>
      )}

      <div className="schedule-info">
        {loading ? 'Loading schedule...' : formatScheduleInfo()}
      </div>

      <div className="schedule-buttons">
        <button
          className="preset-btn"
          onClick={handleScheduleTomorrow}
          disabled={isSubmitting || loading}
        >
          Schedule Heat Tomorrow
        </button>
        {schedule && (
          <button
            className="preset-btn"
            onClick={handleCancel}
            disabled={isSubmitting || loading}
          >
            Cancel
          </button>
        )}
        <button className="preset-btn" disabled>
          Weekly Schedule
        </button>
      </div>
    </section>
  );
}
