// MUST be first catch synchronous exceptions before anything else loads
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message, err.stack);
  process.exit(1);
});

const dns = require('node:dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const AppError = require('./utils/appError');
const dotenv = require('dotenv');
dotenv.config({ path: './config.env' });

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const mongoose = require('mongoose');

const app = express();

const rateLimit = require('express-rate-limit');
const globalErrorHandler = require('./controllers/errorController');
const { bootstrapAdmin } = require('./controllers/authController');


// View engine setup
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '..', 'client', 'dist'), { index: false }));

// Cloud Run (and other reverse proxies) set Forwarded / X-Forwarded-For headers
app.set('trust proxy', true);

// Rate limit login attempts: 10 per 15 minutes per IP
app.use('/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }
}));

// SSE clients registry (used by admin reload-clients endpoint)
app.set('sseClients', new Set());

// Unique version ID — K_REVISION is set by Cloud Run and is identical across all
// instances of the same revision, so version polling works with multiple instances.
// Falls back to Date.now() for local dev (single instance, so no conflict).
app.set('appVersion', process.env.K_REVISION || Date.now().toString());

// Routes
app.use('/', require('./routes/index'));

// SPA catch-all: serve React's index.html for any unmatched GET that isn't
// an API or admin route. React Router handles client-side navigation from here.
const reactIndex = path.join(__dirname, '..', 'client', 'dist', 'index.html');
const fs = require('fs');
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/admin')) return next();
  if (!fs.existsSync(reactIndex)) return next();
  res.sendFile(reactIndex);
});

// 1. Handle all unhandled routes (404)
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// 2. Global Error Handler
app.use(globalErrorHandler);

// Start server immediately so Cloud Run health checks pass
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Allow long-running requests (Gemini signature processing) without Node.js killing the connection
server.timeout = 0;
server.requestTimeout = 0;
server.headersTimeout = 0;
server.keepAliveTimeout = 620_000; // slightly above Cloud Run's 600s LB idle timeout

// Connect to MongoDB after server is up
mongoose.connect(process.env.DATABASE)
  .then(async () => {
    console.log('[DB] MongoDB connected');
    await bootstrapAdmin();
    const startup = require('./utils/startup');
    await startup.seedEmailTemplates();
    await startup.migrateEmailTemplateSchema();
  })
  .catch(err => {
    console.error('[DB] MongoDB connection failed:', err);
    process.exit(1);
  });

// Catch unhandled promise rejections — log but don't exit,
// because process.exit() kills ALL in-flight requests (causes "truncated response" on Cloud Run)
process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION!');
  console.error(err.name, err.message);
});
