const { Router } = require('express');
const { grantAdReward } = require('../controllers/usageController');

const router = Router();

router.post('/ad-reward', grantAdReward);

module.exports = router;
