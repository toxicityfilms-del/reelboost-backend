const { Router } = require('express');
const { body } = require('express-validator');
const { analyze } = require('../controllers/viralController');

const router = Router();
router.post(
  '/analyze',
  [body('caption').isString().trim().notEmpty(), body('hashtags').optional().isString()],
  analyze
);

module.exports = router;
