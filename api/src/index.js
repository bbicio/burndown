const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const { testConnection } = require('./db/client');
const authRoutes      = require('./routes/auth');
const usersRoutes     = require('./routes/users');
const configRoutes    = require('./routes/config');
const costGridRoutes  = require('./routes/cost-grids');
const projectsRoutes  = require('./routes/projects');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.APP_URL || 'http://localhost',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

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
app.use('/api',             configRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`PDash API running on port ${PORT}`);
});
