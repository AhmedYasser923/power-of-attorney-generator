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

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const mongoose = require('mongoose');

const app = express();

const rateLimit = require('express-rate-limit');
const globalErrorHandler = require('./controllers/errorController');
const { isLoggedIn } = require('./middleware/auth');
const { bootstrapAdmin } = require('./controllers/authController');


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

// SSE clients registry (used by admin reload-clients endpoint)
app.set('sseClients', new Set());

// Routes
app.use('/', require('./routes/index'));

// 1. Handle all unhandled routes (404)
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// 2. Global Error Handler
app.use(globalErrorHandler);

// Start server immediately so Cloud Run health checks pass
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Connect to MongoDB after server is up
mongoose.connect(process.env.DATABASE)
  .then(async () => {
    console.log('[DB] MongoDB connected');
    await bootstrapAdmin();
  })
  .catch(err => {
    console.error('[DB] MongoDB connection failed:', err);
    process.exit(1);
  });

// Catch unhandled promise rejections
process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});
