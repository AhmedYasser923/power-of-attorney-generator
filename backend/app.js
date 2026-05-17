// MUST be first catch synchronous exceptions before anything else loads
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message, err.stack);
  process.exit(1);
});

const dns = require('node:dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const AppError = require('./utils/appError');
const path = require('path');
const dotenv = require('dotenv');
const envPath = path.join(__dirname, 'config.env');
dotenv.config({ path: envPath });

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('[SECURITY] JWT_SECRET is missing or too weak. Use at least 32 random characters.');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

const WEAK_PASSWORDS = ['SuperSecret123', 'password', 'admin', '12345678'];
if (process.env.ADMIN_PASSWORD && WEAK_PASSWORDS.includes(process.env.ADMIN_PASSWORD)) {
  console.error('[SECURITY] ADMIN_PASSWORD is a known weak default. Change it before deploying.');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

const REQUIRED_ENV = ['DATABASE', 'JWT_SECRET', 'GEMINI_API_KEY'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`[STARTUP] Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const mongoose = require('mongoose');

const app = express();

const rateLimit = require('express-rate-limit');
const globalErrorHandler = require('./controllers/errorController');
const { bootstrapAdmin } = require('./controllers/authController');
const csrfProtect = require('./middleware/csrf');
const requestId = require('./middleware/requestId');
const sanitizeMongo = require('./middleware/sanitizeMongo');
const { isOriginAllowed } = require('./utils/allowedOrigins');
const routes = require('./routes/index');


// View engine setup
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Cloud Run (and other reverse proxies) set Forwarded / X-Forwarded-For headers
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Middleware
app.use(requestId);
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors((req, callback) => {
  const origin = req.get('Origin');

  callback(null, {
    credentials: true,
    origin: origin && isOriginAllowed(origin, req) ? origin : false,
  });
}));

app.use(cookieParser());
app.use(csrfProtect);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { status: 'fail', message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth/login', loginLimiter);

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { status: 'fail', message: 'Too many signup attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth/signup', signupLimiter);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { status: 'fail', message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', apiLimiter);

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { status: 'fail', message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/admin', adminLimiter);

app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
app.use(sanitizeMongo);
app.use(hpp());
app.use(express.static(path.join(__dirname, 'public')));

const clientDistPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, 'client-dist')
  : path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath, { index: false }));

// SSE clients registry (used by admin reload-clients endpoint)
app.set('sseClients', new Set());

// Unique version ID - K_REVISION is set by Cloud Run and is identical across all
// instances of the same revision, so version polling works with multiple instances.
// Falls back to Date.now() for local dev (single instance, so no conflict).
app.set('appVersion', process.env.K_REVISION || Date.now().toString());

// Routes
app.use('/', routes);

// SPA catch-all: serve React's index.html for any unmatched GET that isn't
// an API or admin route. React Router handles client-side navigation from here.
const fs = require('fs');
const reactIndex = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, 'client-dist', 'index.html')
  : path.join(__dirname, '..', 'client', 'dist', 'index.html');
const spaFileExists = fs.existsSync(reactIndex);

if (spaFileExists) {
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/admin')) return next();
    res.sendFile(reactIndex);
  });
}

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

function gracefulShutdown(signal) {
  console.log(`[${signal}] Shutting down gracefully...`);
  routes.setDbReady(false);
  server.close(() => {
    console.log('[Server] HTTP server closed');
    mongoose.connection.close(false).then(() => {
      console.log('[DB] MongoDB connection closed');
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error('[Server] Forced exit after timeout');
    process.exit(1);
  }, 25_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Allow generous timeouts for Gemini processing without leaving sockets unlimited.
server.timeout = 300_000;
server.requestTimeout = 300_000;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 620_000; // slightly above Cloud Run's 600s LB idle timeout

mongoose.connection.on('disconnected', () => {
  routes.setDbReady(false);
});

mongoose.connection.on('reconnected', () => {
  routes.setDbReady(true);
});

// Connect to MongoDB after server is up
mongoose.connect(process.env.DATABASE)
  .then(async () => {
    console.log('[DB] MongoDB connected');
    routes.setDbReady();
    await bootstrapAdmin();
    const startup = require('./utils/startup');
    await startup.migrateEmailTemplateSchema();
  })
  .catch(err => {
    console.error('[DB] MongoDB connection failed:', err);
    process.exit(1);
  });

// Catch unhandled promise rejections - log but don't exit,
// because process.exit() kills ALL in-flight requests (causes "truncated response" on Cloud Run)
process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION!');
  console.error(err.name, err.message);
});
