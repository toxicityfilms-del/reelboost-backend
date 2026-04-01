const { Router } = require('express');
const { body } = require('express-validator');
const { signup, login, forgotPassword, resetPassword } = require('../controllers/authController');

const router = Router();

router.post(
  '/signup',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').optional().isString().trim(),
  ],
  signup
);

router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  login
);

router.post('/forgot-password', [body('email').isEmail().normalizeEmail()], forgotPassword);

router.post(
  '/reset-password',
  [
    body('token').isString().trim().notEmpty(),
    body('password')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be between 8 and 128 characters'),
  ],
  resetPassword
);

module.exports = router;
