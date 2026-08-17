import { Router } from 'express';
import { MessagesController } from './messages.controller.js';
import { authenticateApiKey } from '../../middleware/auth.js';
import { apiRateLimiter } from '../../middleware/rateLimit.js';

const router = Router();

router.use(authenticateApiKey);

router.post('/send', apiRateLimiter(60), MessagesController.send);
router.post('/bulk', apiRateLimiter(20), MessagesController.bulkSend);
router.post('/schedule', apiRateLimiter(60), MessagesController.schedule);
router.get('/', MessagesController.list);
router.get('/:id', MessagesController.getById);
router.post('/:id/retry', MessagesController.retry);

export default router;
