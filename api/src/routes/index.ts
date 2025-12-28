import { Router } from 'express';
import sensorsRouter from './sensors.js';
import controlRouter from './control.js';
import scheduleRouter from './schedule.js';

const router = Router();

router.use('/sensors', sensorsRouter);
router.use('/control', controlRouter);
router.use('/schedule', scheduleRouter);

export { router as routes };
