const { Router } = require('express');
const { body } = require('express-validator');
const { getProfileMe, saveProfile } = require('../controllers/profileController');

const router = Router();

router.get('/me', getProfileMe);

router.post(
  '/save',
  [
    body('name').optional().isString(),
    body('bio').optional().isString(),
    body('instagram').optional().isString(),
    body('facebook').optional().isString(),
    body('niche').optional().isString(),
  ],
  saveProfile
);

module.exports = router;
