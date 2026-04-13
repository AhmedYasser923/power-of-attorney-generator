// MUST be first: catch synchronous exceptions before anything else loads
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

const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });

const rateLimit = require('express-rate-limit');
const globalErrorHandler = require('./controllers/errorController');
const { isLoggedIn } = require('./middleware/auth');
const { bootstrapAdmin } = require('./controllers/authController');
const { initSocketManager } = require('./utils/socketManager');

// Make io accessible in controllers via req.app.get('io')
app.set('io', io);

// Initialize Redis adapter for Socket.io (enables multi-instance support on Cloud Run)
const redisUrl = process.env.REDIS_URL ||
  (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : null);

if (redisUrl) {
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[Socket.io] Redis adapter connected');
    })
    .catch((err) => {
      console.warn('[Socket.io] Redis connection failed, falling back to in-memory:', err.message);
    });
} else {
  console.warn('[Socket.io] REDIS_URL not configured, using in-memory adapter (single instance only)');
}

// View engine setup
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limit login attempts: 10 per 15 minutes per IP
app.use('/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false
}));

// Set res.locals.user on every request for template rendering
app.use(isLoggedIn);

// Routes
app.use('/', require('./routes/index'));

// 1. Handle all unhandled routes (404)
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// 2. Global Error Handler
app.use(globalErrorHandler);

// MongoDB Connection + Server Start
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.DATABASE)
  .then(async () => {
    console.log('[DB] MongoDB connected');
    await bootstrapAdmin();
    initSocketManager(io);
    server.listen(PORT, () => {
      console.log(`Server running on http://127.0.0.1:${PORT}`);
    });
  })
  .catch(err => {
    console.error('[DB] MongoDB connection failed:', err);
    process.exit(1);
  });

// Catch unhandled promise rejections
process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
