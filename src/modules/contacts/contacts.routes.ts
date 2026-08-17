import { Router } from 'express';
import { ContactsController } from './contacts.controller.js';
import { authenticateApiKey } from '../../middleware/auth.js';

const router = Router();

router.use(authenticateApiKey);

router.get('/', ContactsController.list);
router.post('/', ContactsController.create);
router.get('/:id', ContactsController.getById);

export default router;
