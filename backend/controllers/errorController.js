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

function logUnexpected(req, err) {
  console.error(`ERROR [${req.id}]`, err);
}

// --- SEND HELPERS ---

const sendErrorDev = (err, req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      requestId: req.id,
      stack: err.stack
    });
  }

  if (!err.isOperational) logUnexpected(req, err);
  return res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    requestId: req.id,
    stack: err.stack
  });
};

const sendErrorProd = (err, req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        requestId: req.id
      });
    }

    logUnexpected(req, err);
    return res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!',
      requestId: req.id
    });
  }

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      requestId: req.id
    });
  }

  logUnexpected(req, err);
  return res.status(500).json({
    status: 'error',
    message: 'Something went very wrong!',
    requestId: req.id
  });
};

// --- GLOBAL ERROR HANDLER ---
module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  let error = err;

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error = handleJSONSyntaxError();
  } else if (err.name === 'MulterError') {
    error = handleMulterError(err);
  }

  if (process.env.NODE_ENV === 'production') {
    sendErrorProd(error, req, res);
  } else {
    sendErrorDev(error, req, res);
  }
};
