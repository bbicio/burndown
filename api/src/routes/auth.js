const express = require('express');
const router = express.Router();

// Placeholder — auth routes coming next
router.get('/ping', (req, res) => res.json({ ok: true }));

module.exports = router;
