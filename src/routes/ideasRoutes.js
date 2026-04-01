const { Router } = require('express');
const { body } = require('express-validator');
const { generate } = require('../controllers/ideasController');

const router = Router();
router.post('/generate', [body('niche').isString().trim().notEmpty()], generate);

module.exports = router;
