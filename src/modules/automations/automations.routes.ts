import { Router } from 'express';
import { AutomationsController } from './automations.controller.js';
import { authenticateApiKey } from '../../middleware/auth.js';

const router = Router();

router.use(authenticateApiKey);

router.get('/', AutomationsController.list);
router.post('/', AutomationsController.create);
router.post('/trigger', AutomationsController.trigger);
router.patch('/:id', AutomationsController.update);
router.delete('/:id', AutomationsController.delete);

export default router;
