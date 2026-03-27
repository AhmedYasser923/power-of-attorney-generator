const sendErrorDev = (err, req, res) => {
  // A) API ERRORS: Return detailed JSON
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  }

  // B) RENDERED WEBSITE ERRORS: Show full error page with stack trace
  console.error('ERROR 💥', err);
  return res.status(err.statusCode).render('error', {
    title: 'Something went wrong!',
    msg: err.message,
    stack: err.stack // Leak stack trace in dev for debugging
  });
};

const sendErrorProd = (err, req, res) => {
  // A) API ERRORS
  if (req.originalUrl.startsWith('/api')) {
    // Operational, trusted error: send friendly message to client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    }
    // Programming or other unknown error: don't leak details to client
    console.error('ERROR 💥', err);
    return res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!'
    });
  }

  // B) RENDERED WEBSITE ERRORS
  if (err.isOperational) {
    return res.status(err.statusCode).render('error', {
      title: 'Something went wrong!',
      msg: err.message
    });
  }
  
  // Programming error
  console.error('ERROR 💥', err);
  return res.status(err.statusCode).render('error', {
    title: 'Something went wrong!',
    msg: 'Please try again later.'
  });
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    // Copy the error object safely
    let error = Object.assign(err); 
    
    // You can add custom mongoose/database error handlers here in the future
    // e.g., if (error.name === 'ValidationError') error = handleValidationErrorDB(error);

    sendErrorProd(error, req, res);
  } else {
    // Fallback if NODE_ENV is not set
    sendErrorDev(err, req, res);
  }
};