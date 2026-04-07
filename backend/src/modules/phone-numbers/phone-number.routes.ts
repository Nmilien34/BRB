import { Router } from 'express';
import { getPhoneNumbers } from './phone-number.controller.js';

const router = Router();
router.get('/', getPhoneNumbers);

export default router;
