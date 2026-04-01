const express = require('express');
const { resetSuspiciousFlagsForUser } = require('../controllers/adminController');

const router = express.Router();

router.post('/users/:userId/reset-suspicious-flags', resetSuspiciousFlagsForUser);

module.exports = router;
