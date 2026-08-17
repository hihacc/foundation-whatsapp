import { Router } from 'express';
import { HealthController } from './health.controller.js';
import { authenticateApiKey } from '../../middleware/auth.js';

const router = Router();

// Public liveness probe
router.get('/health', HealthController.getHealth);

// Authenticated detailed status
router.get('/status', authenticateApiKey, HealthController.getStatus);

export default router;
