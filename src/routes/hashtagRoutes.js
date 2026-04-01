const { Router } = require('express');
const { body } = require('express-validator');
const { generate } = require('../controllers/hashtagController');

const router = Router();
router.post('/generate', [body('keyword').isString().trim().notEmpty()], generate);

module.exports = router;
