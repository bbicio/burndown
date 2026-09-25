const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { processQueue } = require('../services/profile-engine');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// POST /api/profile-jobs/run — drain the profile queue now (also used by the tests).
// 409 when another run holds the lock. Sub-cycle 3d adds the rest of the console API to this file.
router.post('/run', async (req, res, next) => {
  try {
    const r = await processQueue('manual');
    if (r.skipped) return res.status(409).json({ error: 'A profile job is already running' });
    res.json({ ok: true, projects: r.projects, resources: r.resources, errors: r.errors });
  } catch (err) { next(err); }
});

module.exports = router;
