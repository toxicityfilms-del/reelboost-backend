const { Router } = require('express');
const { body } = require('express-validator');
const { generate } = require('../controllers/captionController');

const router = Router();
router.post('/generate', [body('idea').isString().trim().notEmpty()], generate);

module.exports = router;
