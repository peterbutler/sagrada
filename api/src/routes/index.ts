import { Router } from 'express';
import sensorsRouter from './sensors.js';
import controlRouter from './control.js';
import scheduleRouter from './schedule.js';
import systemRouter from './system.js';

const router = Router();

router.use('/sensors', sensorsRouter);
router.use('/control', controlRouter);
router.use('/schedule', scheduleRouter);
router.use('/system', systemRouter);

export { router as routes };
