import { Router, Request, Response } from 'express';
import { setTargetTemperature } from '../services/thermostat.js';
import { setDeviceState } from '../services/devices.js';
import { SetTargetRequest, SetDeviceRequest, DeviceName } from '../types/index.js';

const router = Router();

/**
 * POST /control/target
 * Body: { temperature: number, duration_hours?: number }
 */
router.post('/target', async (req: Request, res: Response) => {
  try {
    const { temperature, duration_hours } = req.body as SetTargetRequest;

    if (typeof temperature !== 'number') {
      res.status(400).json({ success: false, error: 'temperature is required and must be a number' });
      return;
    }

    await setTargetTemperature(temperature, duration_hours);
    res.json({ success: true });
  } catch (err) {
    console.error('Error setting target temperature:', err);
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to set temperature',
    });
  }
});

/**
 * POST /control/device
 * Body: { device: "heater" | "pump" | "fan", state: boolean }
 */
router.post('/device', async (req: Request, res: Response) => {
  try {
    const { device, state } = req.body as SetDeviceRequest;

    const validDevices: DeviceName[] = ['heater', 'pump', 'fan'];
    if (!validDevices.includes(device)) {
      res.status(400).json({ success: false, error: `Invalid device: ${device}` });
      return;
    }

    if (typeof state !== 'boolean') {
      res.status(400).json({ success: false, error: 'state must be a boolean' });
      return;
    }

    await setDeviceState(device, state);
    res.json({ success: true });
  } catch (err) {
    console.error('Error controlling device:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to control device',
    });
  }
});

export default router;
