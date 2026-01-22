import { Router, Request, Response } from 'express';
import { getSystemHealth } from '../services/system.js';

const router = Router();

/**
 * GET /system/health
 * Returns disk usage and database table size information.
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await getSystemHealth();
    res.json({ success: true, data: health });
  } catch (err) {
    console.error('Error fetching system health:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
});

export default router;
