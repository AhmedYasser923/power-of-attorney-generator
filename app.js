const AppError = require('./utils/appError');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
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
  // Passing an argument to next() automatically tells Express an error occurred
  // and skips all other middleware to go straight to the global error handler
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// 2. Use the new Global Error Handling Middleware
app.use(globalErrorHandler);




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});

