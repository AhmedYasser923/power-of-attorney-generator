// MUST be first: catch synchronous exceptions before anything else loads
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message, err.stack);
  process.exit(1);
});

const AppError = require('./utils/appError');
const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const globalErrorHandler = require('./controllers/errorController');


// View engine setup
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./routes/index'));

// 1. Handle all unhandled routes (404)
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// 2. Global Error Handler
app.use(globalErrorHandler);


const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});

// Catch unhandled promise rejections (async errors that escape Express)
process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
