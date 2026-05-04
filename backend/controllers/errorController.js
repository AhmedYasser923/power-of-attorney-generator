const AppError = require('../utils/appError');

// --- SPECIFIC ERROR TYPE CONVERTERS ---

// body-parser fires a SyntaxError with err.status=400 on malformed JSON bodies
const handleJSONSyntaxError = () =>
  new AppError('Invalid JSON in request body. Please check your request format.', 400);

// Multer (file upload) errors
const handleMulterError = (err) => {
  const messages = {
    LIMIT_FILE_SIZE: 'Uploaded file is too large.',
    LIMIT_FILE_COUNT: 'Too many files uploaded at once.',
    LIMIT_UNEXPECTED_FILE: `Unexpected upload field: "${err.field}".`,
    LIMIT_PART_COUNT: 'Too many form parts in the request.',
    LIMIT_FIELD_KEY: 'A form field name is too long.',
    LIMIT_FIELD_VALUE: 'A form field value is too long.',
  };
  const message = messages[err.code] || `File upload error: ${err.message}`;
  return new AppError(message, 400);
};


// --- SEND HELPERS ---

const sendErrorDev = (err, req, res) => {
  // API: return full JSON with stack trace
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  }
  // Rendered page: only log unexpected server errors, not operational 404s etc.
  if (!err.isOperational) console.error('ERROR', err);
  return res.status(err.statusCode).render('error', {
    title: 'Something went wrong!',
    msg: err.message,
    stack: err.stack
  });
};

const sendErrorProd = (err, req, res) => {
  // API errors
  if (req.originalUrl.startsWith('/api')) {
    // Operational / expected error → show user-friendly message
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    }
    // Programming / unknown error → don't leak internals
    console.error('ERROR', err);
    return res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!'
    });
  }

  // Rendered-page errors
  if (err.isOperational) {
    return res.status(err.statusCode).render('error', {
      title: 'Something went wrong!',
      msg: err.message
    });
  }
  // Programming / unknown error → always 500, never leak err.statusCode
  console.error('ERROR', err);
  return res.status(500).render('error', {
    title: 'Something went wrong!',
    msg: 'Please try again later.'
  });
};


// --- GLOBAL ERROR HANDLER ---
module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // In both dev and prod we want to convert known framework errors to
  // friendly AppErrors before deciding how much detail to expose.
  let error = err;

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error = handleJSONSyntaxError();
  } else if (err.name === 'MulterError') {
    error = handleMulterError(err);
  }

  if (process.env.NODE_ENV === 'production') {
    sendErrorProd(error, req, res);
  } else {
    // Development and any other NODE_ENV → full details
    sendErrorDev(error, req, res);
  }
};
