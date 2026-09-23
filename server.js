require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const apolloRoutes = require('./routes/apollo');
const anthropicRoutes = require('./routes/anthropic');
const pipelineRoutes = require('./routes/pipeline');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security & middleware ────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP off so we can load CDN fonts/icons
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
  methods: ['GET', 'POST'],
}));

// ─── Static files ─────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API routes ───────────────────────────────────────────────────
app.use('/api/apollo', apolloRoutes);
app.use('/api/ai', anthropicRoutes);
app.use('/api/pipeline', pipelineRoutes);

// ─── Health check ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    apollo: !!process.env.APOLLO_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    env: process.env.NODE_ENV,
  });
});

// ─── SPA fallback — serve index.html for all non-API routes ───────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global error handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 LeadAI running at http://localhost:${PORT}`);
  console.log(`   Apollo API: ${process.env.APOLLO_API_KEY ? '✓ configured' : '✗ missing APOLLO_API_KEY'}`);
  console.log(`   Anthropic:  ${process.env.ANTHROPIC_API_KEY ? '✓ configured' : '✗ missing ANTHROPIC_API_KEY'}`);
  console.log(`   Env: ${process.env.NODE_ENV}\n`);
});
