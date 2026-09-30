const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const { testConnection } = require('./db/client');
const authRoutes      = require('./routes/auth');
const usersRoutes     = require('./routes/users');
const configRoutes    = require('./routes/config');
const costGridRoutes  = require('./routes/cost-grids');
const projectsRoutes    = require('./routes/projects');
const timesheetsRoutes  = require('./routes/timesheets');
const reportingRoutes   = require('./routes/reporting');
const exportsRoutes     = require('./routes/exports');
const { router: notifRoutes } = require('./routes/notifications');
const clientGroupsRoutes  = require('./routes/client-groups');
const potsRoutes          = require('./routes/pots');
const pipelineYearsRoutes = require('./routes/pipeline-years');
const resetRoutes         = require('./routes/reset');
const currenciesRoutes    = require('./routes/currencies');
const appSettingsRoutes   = require('./routes/app-settings');
const attributeListsRoutes = require('./routes/attribute-lists');
const resourcesRoutes = require('./routes/resources');
const profileJobsRoutes = require('./routes/profile-jobs');
const topicsRoutes = require('./routes/topics');
const planningRoutes = require('./routes/planning');
const { invalidatePlanningData } = require('./services/planning-data');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.APP_URL || 'http://localhost',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Any successful write under these prefixes may change what the planning model computes
// (projects/tasks, actuals, resources/aliases, bulk resets, cost-grid deletes that cascade to projects).
// One place instead of a call in every route; over-invalidating is harmless (30 s cache).
const PLANNING_WRITE_PREFIXES = ['/api/projects', '/api/timesheets', '/api/resources', '/api/admin/reset', '/api/cost-grids'];
app.use((req, res, next) => {
  if (req.method !== 'GET' && PLANNING_WRITE_PREFIXES.some(p => req.path.startsWith(p))) {
    res.on('finish', () => { if (res.statusCode < 400) invalidatePlanningData(); });
  }
  next();
});

// Health check
app.get('/api/health', async (req, res) => {
  const dbOk = await testConnection();
  res.json({
    status: 'ok',
    db: dbOk ? 'connected' : 'unreachable',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/auth',        authRoutes);
app.use('/api/users',       usersRoutes);
app.use('/api/cost-grids',  costGridRoutes);
app.use('/api/projects',    projectsRoutes);
app.use('/api/timesheets',  timesheetsRoutes);
app.use('/api/reporting',   reportingRoutes);
app.use('/api/exports',     exportsRoutes);
app.use('/api/notifications',  notifRoutes);
app.use('/api/client-groups',   clientGroupsRoutes);
app.use('/api/pots',            potsRoutes);
app.use('/api/pipeline-years',  pipelineYearsRoutes);
app.use('/api/admin/reset',     resetRoutes);
app.use('/api/currencies',      currenciesRoutes);
app.use('/api/app-settings',    appSettingsRoutes);
app.use('/api/attribute-lists', attributeListsRoutes);
app.use('/api/resources',       resourcesRoutes);
app.use('/api/profile-jobs',    profileJobsRoutes);
app.use('/api/topics',           topicsRoutes);
app.use('/api/planning',        planningRoutes);
app.use('/api',               configRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`PDash API running on port ${PORT}`);
  require('./services/profile-worker').start();
});
