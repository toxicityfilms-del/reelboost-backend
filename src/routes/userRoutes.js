const express = require('express');
const { upgradeUser } = require('../controllers/userController');

const router = express.Router();

router.post('/upgrade', upgradeUser);

module.exports = router;

