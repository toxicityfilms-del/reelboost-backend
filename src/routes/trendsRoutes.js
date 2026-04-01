const { Router } = require('express');
const { list } = require('../controllers/trendsController');

const router = Router();
router.get('/', list);

module.exports = router;
