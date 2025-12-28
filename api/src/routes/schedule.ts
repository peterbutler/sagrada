import { Router, Request, Response } from 'express';
import {
  scheduleHeat,
  getNextScheduledEvent,
  deleteNextScheduledEvent,
} from '../services/schedule.js';
import { ScheduleHeatRequest } from '../types/index.js';

const router = Router();

/**
 * POST /schedule/heat
 * Body: { start_time: string (ISO8601), duration_hours: number, temperature?: number }
 */
router.post('/heat', async (req: Request, res: Response) => {
  try {
    const { start_time, duration_hours, temperature } = req.body as ScheduleHeatRequest & {
      temperature?: number;
    };

    if (!start_time) {
      res.status(400).json({ success: false, error: 'start_time is required' });
      return;
    }

    if (typeof duration_hours !== 'number' || duration_hours <= 0) {
      res.status(400).json({ success: false, error: 'duration_hours must be a positive number' });
      return;
    }

    const startDate = new Date(start_time);
    if (isNaN(startDate.getTime())) {
      res.status(400).json({ success: false, error: 'Invalid start_time format' });
      return;
    }

    const id = await scheduleHeat(startDate, duration_hours, temperature);
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error scheduling heat:', err);
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to schedule heating',
    });
  }
});

/**
 * GET /schedule/next
 * Returns the next scheduled heating event
 */
router.get('/next', async (_req: Request, res: Response) => {
  try {
    const event = await getNextScheduledEvent();
    if (event) {
      res.json({ success: true, scheduled: true, ...event });
    } else {
      res.json({ success: true, scheduled: false });
    }
  } catch (err) {
    console.error('Error getting next scheduled event:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get schedule',
    });
  }
});

/**
 * DELETE /schedule/next
 * Cancels the next scheduled heating event
 */
router.delete('/next', async (_req: Request, res: Response) => {
  try {
    const deleted = await deleteNextScheduledEvent();
    if (deleted) {
      res.json({ success: true, message: 'Next scheduled event cancelled' });
    } else {
      res.json({ success: true, message: 'No scheduled event to cancel' });
    }
  } catch (err) {
    console.error('Error deleting scheduled event:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to cancel schedule',
    });
  }
});

export default router;
