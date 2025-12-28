import { Router, Request, Response } from 'express';
import { getTemperatureHistory } from '../services/sensors.js';

const router = Router();

/**
 * GET /sensors/history
 * Query params:
 *   - location: sensor location (required, format: system/location e.g. "heating/tank")
 *   - minutes: number of minutes of history (default 60)
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const location = req.query.location as string;
    const minutes = parseInt(req.query.minutes as string, 10) || 60;

    if (!location) {
      res.status(400).json({ success: false, error: 'location parameter is required' });
      return;
    }

    const history = await getTemperatureHistory(location, minutes);
    res.json({ success: true, data: history });
  } catch (err) {
    console.error('Error fetching temperature history:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
});

export default router;
