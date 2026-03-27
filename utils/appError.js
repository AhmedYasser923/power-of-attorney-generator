class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    // 4xx errors are 'fail' (client error), 5xx are 'error' (server error)
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    // Flag this as an operational error so we know it's a predictable error
    this.isOperational = true; 

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;